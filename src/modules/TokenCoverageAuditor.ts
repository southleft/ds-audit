import path from 'path';
import type {
  AuditConfig,
  TokenInfo,
  TokenUsageInfo,
  HardcodedValue,
  TokenCoverageMetrics,
  ComponentTokenUsage,
  TokenRedundancy,
} from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';
import { TokenMatcher } from '../utils/TokenMatcher.js';
import { TokenParser } from '../utils/TokenParser.js';

export interface TokenCoverageReport {
  usageMapping: TokenUsageInfo[];
  hardcodedValues: HardcodedValue[];
  redundancies: TokenRedundancy[];
  coverageMetrics: TokenCoverageMetrics;
  componentUsage: ComponentTokenUsage[];
  /** Number of source files scanned for usage — the denominator for hardcoded-value pressure. */
  sourceFilesScanned: number;
}

interface FileStats {
  tokensUsed: Set<string>;
  hardcodedCount: number;
}

/**
 * Measures real token adoption with a single deduped source-file scan.
 *
 * Token usage is counted ONLY from signals that are unambiguous:
 *  (a) exact `var(--token-name)` references,
 *  (b) exact token dot-path references in JS/TS (`tokens.color.primary`,
 *      `theme.spacing.lg`, `getToken('color.primary')`),
 *  (c) exact `$sass-variable` references in SCSS/Sass.
 *
 * Hardcoded style values (colors, dimensions — unit-aware) are collected with
 * line numbers; a hardcoded value whose normalized value exactly matches a
 * token becomes a "replaceable" suggestion (`matchedToken`) but is NEVER
 * counted as usage. Alias references between tokens also never count as
 * component usage; however, usage propagates through alias chains so that a
 * primitive reached only via a *used* semantic alias is not reported unused.
 */
export class TokenCoverageAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;
  private tokens: TokenInfo[];
  private matcher: TokenMatcher;
  private tokenUsageMap: Map<string, TokenUsageInfo> = new Map();
  private fileStats: Map<string, FileStats> = new Map();
  /** Files where tokens are defined — excluded from the usage scan. */
  private tokenFilePaths: Set<string>;

  /** Cap per-token/per-value file evidence lists so reports stay small; counts stay exact. */
  private static readonly MAX_FILE_ENTRIES = 200;

  private static readonly SOURCE_PATTERNS = [
    '**/*.{js,jsx,ts,tsx,vue,svelte}',
    '**/*.{css,scss,sass,less}',
    '**/*.html',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/.next/**',
    '!**/*.test.*',
    '!**/*.spec.*',
    '!**/*.stories.*',
    '!**/*.d.ts',
    '!**/*.generated.*',
    '!**/*.min.*',
  ];

  private static readonly HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
  private static readonly FN_COLOR = /(?:rgba?|hsla?)\([^)]*\)/g;
  private static readonly DIMENSION = /(-?\d*\.?\d+)(px|rem|em|vh|vw|pt|ms|s)\b/g;
  private static readonly CSS_DECLARATION = /([a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
  private static readonly JS_STRING_DECLARATION = /([a-zA-Z]+)\s*:\s*['"`]([^'"`]+)['"`]/g;
  private static readonly SASS_VAR = /\$[a-zA-Z0-9_-]+/g;

  constructor(config: AuditConfig, tokens: TokenInfo[]) {
    this.config = config;
    this.scanner = new FileScanner(config);
    this.tokens = tokens;
    this.matcher = new TokenMatcher(tokens);
    this.tokenFilePaths = new Set(tokens.map(t => t.path));
  }

  async analyzeCoverage(): Promise<TokenCoverageReport> {
    // Every token starts unused; usage is earned only from the source scan.
    for (const token of this.tokens) {
      if (!this.tokenUsageMap.has(token.name)) {
        this.tokenUsageMap.set(token.name, {
          tokenName: token.name,
          tokenValue: token.value,
          usageCount: 0,
          files: [],
        });
      }
    }

    const files = await this.scanner.scanFiles(TokenCoverageAuditor.SOURCE_PATTERNS);
    // Token definition files would otherwise count their own alias
    // definitions (`--semantic: var(--primitive)`) as usage.
    const sourceFiles = files.filter(f => !this.tokenFilePaths.has(f.path));

    const hardcodedValues = new Map<string, HardcodedValue>();
    for (const file of sourceFiles) {
      try {
        await this.scanFile(file.path, hardcodedValues);
      } catch {
        // Unreadable file — skip; its absence does not fabricate signal.
      }
    }

    this.propagateAliasUsage();

    return {
      usageMapping: Array.from(this.tokenUsageMap.values()),
      hardcodedValues: Array.from(hardcodedValues.values()),
      redundancies: this.matcher.findRedundantTokens(),
      coverageMetrics: this.calculateCoverageMetrics(),
      componentUsage: this.buildComponentUsage(),
      sourceFilesScanned: sourceFiles.length,
    };
  }

  private async scanFile(
    filePath: string,
    hardcodedValues: Map<string, HardcodedValue>
  ): Promise<void> {
    const content = await this.scanner.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isJS = ['.js', '.jsx', '.ts', '.tsx'].includes(ext);
    const isSass = ext === '.scss' || ext === '.sass';

    const stats: FileStats = { tokensUsed: new Set(), hardcodedCount: 0 };
    this.fileStats.set(filePath, stats);

    const lines = content.split('\n');
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const stripped = TokenCoverageAuditor.stripComments(lines[i], inBlockComment);
      inBlockComment = stripped.inBlockComment;
      const code = stripped.code;
      if (!code.trim()) continue;
      const lineNum = i + 1;
      const context = code.trim().slice(0, 200);

      // (a) exact var(--token) references
      for (const varName of TokenParser.extractVarUsages(code)) {
        this.recordUsage(varName, filePath, lineNum, context, stats);
      }

      // (b) exact token dot-path references in JS/TS
      if (isJS) {
        for (const ref of TokenParser.extractJSTokenReferences(code)) {
          this.recordUsage(ref, filePath, lineNum, context, stats);
        }
      }

      // (c) exact $sass-variable references (not the definition line itself)
      if (isSass) {
        const trimmed = code.trim();
        for (const ref of code.match(TokenCoverageAuditor.SASS_VAR) || []) {
          if (trimmed.startsWith(`${ref}:`) || trimmed.startsWith(`${ref} :`)) continue;
          this.recordUsage(ref, filePath, lineNum, context, stats);
        }
      }

      // Hardcoded style values, unit-aware, with line numbers.
      this.collectHardcodedValues(code, isJS, filePath, lineNum, context, hardcodedValues, stats);
    }
  }

  /** Count a usage only when the name resolves to a known token — exactly. */
  private recordUsage(
    name: string,
    filePath: string,
    line: number,
    context: string,
    stats: FileStats
  ): void {
    const token = this.matcher.findTokenByName(name);
    if (!token) return;

    const usage = this.tokenUsageMap.get(token.name);
    if (!usage) return;

    usage.usageCount++;
    if (usage.files.length < TokenCoverageAuditor.MAX_FILE_ENTRIES) {
      usage.files.push({ path: filePath, line, context });
    }
    stats.tokensUsed.add(token.name);
  }

  private collectHardcodedValues(
    code: string,
    isJS: boolean,
    filePath: string,
    lineNum: number,
    context: string,
    hardcodedValues: Map<string, HardcodedValue>,
    stats: FileStats
  ): void {
    // Remove var(...) segments so the tokenized parts of a declaration
    // (including fallbacks) are not re-flagged as hardcoded.
    const codeNoVar = code.replace(/var\([^)]*\)/g, '');

    // Collect candidates per line into a Set to avoid double-recording the
    // same value when the CSS-like and JS-object extractors overlap.
    const candidates = new Set<string>(); // `${property} ${value}`

    const addDeclarations = (regex: RegExp): void => {
      regex.lastIndex = 0;
      for (const match of codeNoVar.matchAll(regex)) {
        const property = match[1];
        const value = match[2];
        if (property && value) candidates.add(`${property} ${value}`);
      }
    };

    addDeclarations(TokenCoverageAuditor.CSS_DECLARATION);
    if (isJS) addDeclarations(TokenCoverageAuditor.JS_STRING_DECLARATION);

    const seenThisLine = new Set<string>();

    for (const candidate of candidates) {
      const sep = candidate.indexOf(' ');
      const rawProperty = candidate.slice(0, sep);
      const value = candidate.slice(sep + 1); // may contain spaces (shorthands, rgba)
      const property = TokenCoverageAuditor.camelToKebab(rawProperty);

      // Colors are flagged wherever they appear in a declaration value.
      for (const colorValue of [
        ...(value.match(TokenCoverageAuditor.HEX_COLOR) || []),
        ...(value.match(TokenCoverageAuditor.FN_COLOR) || []),
      ]) {
        this.recordHardcoded(colorValue, property, filePath, lineNum, context, hardcodedValues, stats, seenThisLine);
      }

      // Dimensions are flagged only on properties where a token is expected.
      if (TokenCoverageAuditor.isDimensionProperty(property)) {
        TokenCoverageAuditor.DIMENSION.lastIndex = 0;
        for (const match of value.matchAll(TokenCoverageAuditor.DIMENSION)) {
          const num = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          if (num === 0) continue; // 0 needs no token
          if (num === 1 && unit === 'px' && property.startsWith('border')) continue; // conventional hairline
          this.recordHardcoded(`${match[1]}${unit}`, property, filePath, lineNum, context, hardcodedValues, stats, seenThisLine);
        }
      }

      // Numeric font weights (e.g. font-weight: 600).
      if (property === 'font-weight') {
        const weight = value.trim().match(/^(\d{3})$/);
        if (weight) {
          this.recordHardcoded(weight[1], property, filePath, lineNum, context, hardcodedValues, stats, seenThisLine);
        }
      }
    }
  }

  private recordHardcoded(
    rawValue: string,
    property: string,
    filePath: string,
    lineNum: number,
    context: string,
    hardcodedValues: Map<string, HardcodedValue>,
    stats: FileStats,
    seenThisLine: Set<string>
  ): void {
    const value = rawValue.trim();
    const type = this.valueType(property, value);
    const key = `${value.toLowerCase()}|${type}`;

    // The same literal can be captured by overlapping extractors on one line.
    const lineKey = `${key}@${lineNum}`;
    if (seenThisLine.has(lineKey)) return;
    seenThisLine.add(lineKey);

    let entry = hardcodedValues.get(key);
    if (!entry) {
      entry = { value, type, files: [] };

      // Exact normalized value match -> "replaceable" suggestion, reported
      // separately and never counted as token usage.
      const exact = this.matcher.findExactValueMatch(value);
      if (exact) {
        entry.matchedToken = exact.name;
        entry.similarity = 1;
      } else if (type === 'color') {
        const near = this.matcher.findSimilarColorToken(value, 0.95);
        if (near) {
          entry.matchedToken = near.token.name;
          entry.similarity = near.similarity;
        }
      }

      hardcodedValues.set(key, entry);
    }

    if (entry.files.length < TokenCoverageAuditor.MAX_FILE_ENTRIES) {
      entry.files.push({ path: filePath, line: lineNum, context });
    }
    stats.hardcodedCount++;
  }

  /**
   * Usage propagates through alias chains: if `--semantic` is used in a
   * component and `--semantic: var(--primitive)`, the primitive is in use.
   * Unused aliases propagate nothing.
   */
  private propagateAliasUsage(): void {
    let changed = true;
    let guard = this.tokens.length + 1;

    while (changed && guard-- > 0) {
      changed = false;
      for (const token of this.tokens) {
        if (!token.aliasOf) continue;

        const sourceUsage = this.tokenUsageMap.get(token.name);
        if (!sourceUsage || sourceUsage.usageCount === 0) continue;

        const target = this.matcher.findTokenByName(token.aliasOf);
        if (!target) continue;

        const targetUsage = this.tokenUsageMap.get(target.name);
        if (targetUsage && targetUsage.usageCount === 0) {
          targetUsage.usageCount = 1;
          targetUsage.files.push({
            path: token.path,
            context: `In use via alias token ${token.name}`,
          });
          changed = true;
        }
      }
    }
  }

  private calculateCoverageMetrics(): TokenCoverageMetrics {
    const usages = Array.from(this.tokenUsageMap.values());
    const usedCount = usages.filter(u => u.usageCount > 0).length;
    const unusedTokens = usages.filter(u => u.usageCount === 0).map(u => u.tokenName);

    const byCategory: TokenCoverageMetrics['byCategory'] = {};
    const tokensByType = new Map<string, TokenInfo[]>();
    for (const token of this.tokens) {
      const list = tokensByType.get(token.type) || [];
      list.push(token);
      tokensByType.set(token.type, list);
    }

    tokensByType.forEach((tokens, type) => {
      const usageData = tokens.map(token => ({
        name: token.name,
        count: this.tokenUsageMap.get(token.name)?.usageCount || 0,
      }));
      const used = usageData.filter(t => t.count > 0);

      byCategory[type] = {
        total: tokens.length,
        used: used.length,
        percentage: tokens.length > 0 ? (used.length / tokens.length) * 100 : 0,
        mostUsed: [...used].sort((a, b) => b.count - a.count).slice(0, 5),
        leastUsed: [...used].sort((a, b) => a.count - b.count).slice(0, 5),
      };
    });

    return {
      totalTokens: this.tokens.length,
      usedTokens: usedCount,
      unusedTokens,
      coveragePercentage: this.tokens.length > 0 ? (usedCount / this.tokens.length) * 100 : 0,
      byCategory,
    };
  }

  /**
   * Per-component adoption derived from the single scan: for each component
   * source file (merged with sibling stylesheets like Button.module.css),
   * coverage = tokens used / (tokens used + hardcoded values). Only files
   * with any style signal are graded.
   */
  private buildComponentUsage(): ComponentTokenUsage[] {
    const componentExts = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']);
    const styleExts = new Set(['.css', '.scss', '.sass', '.less']);

    const styleStatsByBase = new Map<string, FileStats[]>();
    for (const [filePath, stats] of this.fileStats) {
      if (styleExts.has(path.extname(filePath).toLowerCase())) {
        const base = TokenCoverageAuditor.componentBaseKey(filePath);
        const list = styleStatsByBase.get(base) || [];
        list.push(stats);
        styleStatsByBase.set(base, list);
      }
    }

    const results: ComponentTokenUsage[] = [];

    for (const [filePath, stats] of this.fileStats) {
      const ext = path.extname(filePath).toLowerCase();
      if (!componentExts.has(ext)) continue;
      if (!TokenCoverageAuditor.isComponentFile(filePath)) continue;

      const tokensUsed = new Set(stats.tokensUsed);
      let hardcodedCount = stats.hardcodedCount;
      const siblings = styleStatsByBase.get(TokenCoverageAuditor.componentBaseKey(filePath)) || [];
      for (const styleStats of siblings) {
        styleStats.tokensUsed.forEach(t => tokensUsed.add(t));
        hardcodedCount += styleStats.hardcodedCount;
      }

      const total = tokensUsed.size + hardcodedCount;
      if (total === 0) continue; // no style signal — nothing honest to grade

      const coverageScore = (tokensUsed.size / total) * 100;
      const { needsAttention, reasons } = TokenCoverageAuditor.evaluateAttention(
        coverageScore,
        hardcodedCount,
        tokensUsed.size
      );

      results.push({
        componentPath: filePath,
        componentName: path.basename(filePath, ext),
        tokensUsed: Array.from(tokensUsed),
        hardcodedValues: hardcodedCount,
        coverageScore,
        needsAttention,
        attentionReasons: reasons,
      });
    }

    return results.sort((a, b) => a.coverageScore - b.coverageScore);
  }

  private valueType(property: string, value: string): HardcodedValue['type'] {
    if (this.matcher.isColorValue(value)) return 'color';
    const p = property.toLowerCase();
    if (/font|text|line-height|letter-spacing/.test(p)) return 'typography';
    if (/shadow/.test(p)) return 'shadow';
    if (/border|radius|outline/.test(p)) return 'border';
    if (this.matcher.isDimensionValue(value)) return 'spacing';
    return 'other';
  }

  private static isDimensionProperty(property: string): boolean {
    return /^(width|height|min-|max-|padding|margin|gap|row-gap|column-gap|top|left|right|bottom|inset|font-size|line-height|letter-spacing|border|outline|box-shadow|transition|animation|text-indent)/.test(
      property
    );
  }

  private static camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /** Strip // and block comments from a line, tracking multi-line state. */
  private static stripComments(
    line: string,
    inBlockComment: boolean
  ): { code: string; inBlockComment: boolean } {
    let code = '';
    let i = 0;

    while (i < line.length) {
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) return { code, inBlockComment: true };
        inBlockComment = false;
        i = end + 2;
        continue;
      }
      const blockStart = line.indexOf('/*', i);
      const lineStart = line.indexOf('//', i);
      if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) {
        // Don't treat protocol separators (https://) as comments.
        if (lineStart > 0 && line[lineStart - 1] === ':') {
          code += line.slice(i, lineStart + 2);
          i = lineStart + 2;
          continue;
        }
        code += line.slice(i, lineStart);
        return { code, inBlockComment: false };
      }
      if (blockStart !== -1) {
        code += line.slice(i, blockStart);
        i = blockStart + 2;
        inBlockComment = true;
        continue;
      }
      code += line.slice(i);
      break;
    }

    return { code, inBlockComment };
  }

  /** Directory + basename with `.module` and extension stripped. */
  private static componentBaseKey(filePath: string): string {
    const dir = path.dirname(filePath);
    let base = path.basename(filePath, path.extname(filePath));
    if (base.endsWith('.module')) base = base.slice(0, -'.module'.length);
    return `${dir}/${base}`;
  }

  private static isComponentFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath, ext);
    const lower = name.toLowerCase();

    if (lower === 'index') return false;
    if (/(util|helper|constant|types?$|config|context|store|mock|fixture|sample|demo|showcase|example|test|spec|stories|story)/.test(lower)) {
      return false;
    }

    if (ext === '.vue' || ext === '.svelte') return true;
    if (/(^|\/)(components?|ui|elements)\//.test(filePath)) return true;
    // PascalCase JSX/TSX files outside a components dir are still components.
    return /^[A-Z][A-Za-z0-9]*$/.test(name) && (ext === '.jsx' || ext === '.tsx');
  }

  private static evaluateAttention(
    coverageScore: number,
    hardcodedCount: number,
    tokensUsedCount: number
  ): { needsAttention: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (coverageScore < 80 && hardcodedCount > 0) {
      reasons.push(
        `Token coverage only ${coverageScore.toFixed(1)}% — ${hardcodedCount} hardcoded value${hardcodedCount === 1 ? '' : 's'} found`
      );
    }
    if (hardcodedCount > 10) {
      reasons.push(`High number of hardcoded values (${hardcodedCount})`);
    } else if (hardcodedCount > 5) {
      reasons.push(`Multiple hardcoded values (${hardcodedCount}) that could be tokens`);
    }
    if (tokensUsedCount === 0 && hardcodedCount > 0) {
      reasons.push('No design tokens used — all style values are hardcoded');
    }

    return { needsAttention: reasons.length > 0, reasons };
  }
}
