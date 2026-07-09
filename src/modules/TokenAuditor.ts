import path from 'path';
import { glob } from 'glob';
import type { AuditConfig, CategoryResult, Finding, TokenInfo } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';
import { TokenCoverageAuditor, type TokenCoverageReport } from './TokenCoverageAuditor.js';
import { TokenParser } from '../utils/TokenParser.js';
import { StyleDictionaryDetector } from '../utils/StyleDictionaryDetector.js';

interface PatternGroup {
  pattern: string;
  matches: string[];
  fileTypes: Record<string, number>;
}

/**
 * Design-token audit: inventory (generated-CSS-first, multi-theme aware),
 * coverage via TokenCoverageAuditor, and ONE additive score (see
 * calculateScore for the documented formula).
 */
export class TokenAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  // PRIORITY 1: CSS files with actual custom properties. These are the
  // build output a browser really consumes, so they are the most truthful
  // inventory when present.
  private static readonly GENERATED_CSS_PATTERNS = [
    '**/src/styles/**/*.css',
    '**/styles/**/*.css',
    '**/tokens/**/*.css',
    '**/css/**/*tokens*.css',
    'styles/dist/**/*.css',
    'dist/css/tokens*.css',
    'dist/**/*tokens*.css',
    '**/dist/**/*tokens*.css',
    '**/build/**/*tokens*.css',
    '**/*tokens*.css',
    '**/*theme*.css',
    '**/*variables*.css',
  ];

  // PRIORITY 2: Source token files (used when no CSS custom properties exist).
  private static readonly TOKEN_FILE_PATTERNS = [
    '**/tokens/**/*.{json,js,ts}',
    '**/tokens/*.{json,js,ts}',
    '**/design-tokens/**/*.{json,js,ts}',
    '**/design-tokens/*.{json,js,ts}',
    '**/design-system/tokens/**/*.{json,js,ts}',
    '**/styles/tokens/**/*.json',
    '**/libs/*/styles/tokens/**/*.json',
    '**/packages/*/styles/tokens/**/*.json',
    'tokens.{json,js,ts}',
    'design-tokens.{json,js,ts}',
    '**/theme/tokens.{json,js,ts}',
    '**/*.tokens.{json,js,ts}',
    '**/properties/**/*.{json,js}',
    // Sass token sources
    '**/tokens/**/*.{scss,sass}',
    '**/styles/**/_variables.{scss,sass}',
    // Exclusions
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/*.generated.*',
    '!**/*.min.*',
    '!**/*.d.ts',
  ];

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const detailedPaths: PatternGroup[] = [];
    const allScannedPaths = new Set<string>();
    let filesScanned = 0;

    // --- Inventory: generated CSS first ------------------------------------
    // Generated token CSS commonly lives in dist/, which the configured
    // excludePatterns remove from FileScanner results — so this group is
    // scanned with a direct glob (deduped, node_modules excluded).
    const cssFiles = await this.globGeneratedCSS();
    const cssGroup: PatternGroup = { pattern: 'Generated CSS', matches: [], fileTypes: {} };
    const cssTokens: TokenInfo[] = [];

    for (const filePath of cssFiles) {
      cssGroup.matches.push(filePath);
      allScannedPaths.add(path.dirname(filePath));
      cssGroup.fileTypes['.css'] = (cssGroup.fileTypes['.css'] || 0) + 1;
      filesScanned++;
      try {
        const content = await this.scanner.readFile(filePath);
        cssTokens.push(...TokenParser.parseCSSVariables(content, filePath));
      } catch {
        // Unreadable file — contributes no tokens.
      }
    }
    if (cssGroup.matches.length > 0) detailedPaths.push(cssGroup);

    // --- Inventory: source token files -------------------------------------
    const tokenFiles = await this.scanner.scanFiles(TokenAuditor.TOKEN_FILE_PATTERNS);
    const sourceGroup: PatternGroup = { pattern: 'Token Files', matches: [], fileTypes: {} };
    const sourceTokens: TokenInfo[] = [];

    for (const file of tokenFiles) {
      sourceGroup.matches.push(file.path);
      allScannedPaths.add(file.directory);
      const ext = file.extension.toLowerCase();
      sourceGroup.fileTypes[ext] = (sourceGroup.fileTypes[ext] || 0) + 1;
      filesScanned++;
      try {
        const content = await this.scanner.readFile(file.path);
        sourceTokens.push(...this.parseTokenFile(content, file.path, ext));
      } catch {
        // Unreadable/unparsable file — contributes no tokens.
      }
    }
    if (sourceGroup.matches.length > 0) detailedPaths.push(sourceGroup);

    // Prefer CSS custom properties when present; otherwise source tokens.
    // Dedupe by name either way: the same token appears once per theme file
    // (light/dark/brand), and multi-theme duplication is not more tokens.
    const tokens = TokenAuditor.dedupeByName(cssTokens.length > 0 ? cssTokens : sourceTokens);

    // --- Style Dictionary (informational) -----------------------------------
    const sdEvidence = await new StyleDictionaryDetector(this.config.projectPath).detect();
    if (sdEvidence) {
      findings.push({
        id: 'token-style-dictionary',
        type: 'info',
        message: `Style Dictionary detected (${sdEvidence})`,
        severity: 'low',
      });
    }

    // --- Coverage ------------------------------------------------------------
    // Utility-class engines (Tailwind, UnoCSS) consume tokens through
    // generated classes (`bg-brand-500` → var(--color-brand-500) at build
    // time), so source files legitimately contain few direct token
    // references. Direct-reference coverage is not a valid health signal
    // there — detect the bridge and treat coverage as unmeasurable instead
    // of punishing it.
    const utilityBridge = await this.detectUtilityClassBridge();

    let coverageReport: TokenCoverageReport | undefined;
    if (tokens.length > 0) {
      coverageReport = await new TokenCoverageAuditor(this.config, tokens).analyzeCoverage();
      filesScanned += coverageReport.sourceFilesScanned;
      this.addCoverageFindings(coverageReport, findings, utilityBridge);
    }

    this.analyzeTokenStructure(tokens, findings);

    const score = this.calculateScore(tokens, coverageReport, findings, utilityBridge);

    return {
      id: 'tokens',
      name: 'Design Tokens',
      score,
      grade: '', // stamped by the engine from the central table
      weight: 0, // stamped by the engine from the central table
      findings,
      metrics: {
        filesScanned,
        totalTokens: tokens.length,
        tokenTypes: this.categorizeTokens(tokens),
        tokenFormats: this.getTokenFormats(detailedPaths),
        // Distinct hardcoded style values found across source files.
        hardcodedValues: coverageReport ? coverageReport.hardcodedValues.length : 0,
        styleDictionary: sdEvidence ?? 'not detected',
        // 'direct' = var()/theme-path references are the consumption model and
        // coverage % is meaningful; 'utility-bridge' = a utility-class engine
        // consumes tokens at build time and direct coverage is low-signal.
        coverageSignal: utilityBridge ? 'utility-bridge' : 'direct',
        ...(utilityBridge && { utilityBridge }),
        ...(coverageReport && {
          coverage: coverageReport.coverageMetrics,
          tokenUsage: coverageReport.usageMapping,
          redundancies: coverageReport.redundancies,
          componentCoverage: coverageReport.componentUsage,
          hardcodedDetails: coverageReport.hardcodedValues,
          sourceFilesScanned: coverageReport.sourceFilesScanned,
        }),
      },
      scannedPaths: Array.from(allScannedPaths).sort(),
      detailedPaths,
    };
  }

  private async globGeneratedCSS(): Promise<string[]> {
    const seen = new Set<string>();
    for (const pattern of TokenAuditor.GENERATED_CSS_PATTERNS) {
      const files = await glob(pattern, {
        cwd: this.config.projectPath,
        ignore: ['**/node_modules/**', '**/*.min.css'],
        absolute: false,
      });
      files.forEach(f => seen.add(f));
    }
    return Array.from(seen).sort();
  }

  private parseTokenFile(content: string, filePath: string, ext: string): TokenInfo[] {
    switch (ext) {
      case '.json':
        return TokenParser.parseJSON(content, filePath);
      case '.js':
      case '.ts':
        return this.parseJSTokens(content, filePath);
      case '.scss':
      case '.sass':
        return this.parseSCSSTokens(content, filePath);
      case '.css':
        return TokenParser.parseCSSVariables(content, filePath);
      default:
        return [];
    }
  }

  private parseJSTokens(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    // Conservative: only simple exported string constants are treated as tokens.
    const tokenRegex = /(?:const|let|var)\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = tokenRegex.exec(content)) !== null) {
      tokens.push({
        name: match[1],
        value: match[2],
        type: this.detectTokenType(match[1], match[2]),
        category: this.detectTokenCategory(match[1]),
        path: filePath,
        usage: 0,
      });
    }
    return tokens;
  }

  private parseSCSSTokens(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    const variableRegex = /\$([-\w]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = variableRegex.exec(content)) !== null) {
      const value = match[2].trim();
      tokens.push({
        name: `$${match[1]}`,
        value,
        type: this.detectTokenType(match[1], value),
        category: this.detectTokenCategory(match[1]),
        path: filePath,
        usage: 0,
        aliasOf: TokenParser.extractTokenReference(value) ?? undefined,
      });
    }
    return tokens;
  }

  private static dedupeByName(tokens: TokenInfo[]): TokenInfo[] {
    const unique = new Map<string, TokenInfo>();
    for (const token of tokens) {
      if (!unique.has(token.name)) unique.set(token.name, token);
    }
    return Array.from(unique.values());
  }

  private detectTokenType(name: string, value: unknown): TokenInfo['type'] {
    const nameLower = name.toLowerCase();
    const valueStr = String(value).toLowerCase();

    if (nameLower.includes('color') || nameLower.includes('colour') ||
        valueStr.match(/#[0-9a-f]{3,8}|rgb|hsl/i)) {
      return 'color';
    }
    if (nameLower.includes('space') || nameLower.includes('spacing') ||
        nameLower.includes('margin') || nameLower.includes('padding')) {
      return 'spacing';
    }
    if (nameLower.includes('font') || nameLower.includes('text') ||
        nameLower.includes('type')) {
      return 'typography';
    }
    if (nameLower.includes('shadow')) {
      return 'shadow';
    }
    if (nameLower.includes('border') || nameLower.includes('radius')) {
      return 'border';
    }
    return 'other';
  }

  private detectTokenCategory(name: string): TokenInfo['category'] {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('component') || nameLower.includes('comp-')) {
      return 'component';
    }
    if (nameLower.includes('semantic') || nameLower.includes('intent')) {
      return 'semantic';
    }
    return 'global';
  }

  private analyzeTokenStructure(tokens: TokenInfo[], findings: Finding[]): void {
    if (tokens.length === 0) {
      findings.push({
        id: 'token-missing',
        type: 'error',
        message: 'No design tokens found in the project',
        severity: 'critical',
        suggestion: 'Create a design token system to ensure consistency',
      });
      return;
    }

    const tokenTypes = this.categorizeTokens(tokens);

    if (!tokenTypes.color) {
      findings.push({
        id: 'token-missing-colors',
        type: 'warning',
        message: 'No color tokens defined',
        severity: 'high',
        suggestion: 'Define color tokens for consistent theming',
      });
    }
    if (!tokenTypes.spacing) {
      findings.push({
        id: 'token-missing-spacing',
        type: 'warning',
        message: 'No spacing tokens defined',
        severity: 'medium',
        suggestion: 'Define spacing tokens for consistent layout',
      });
    }
    if (!tokenTypes.typography) {
      findings.push({
        id: 'token-missing-typography',
        type: 'warning',
        message: 'No typography tokens defined',
        severity: 'medium',
        suggestion: 'Define typography tokens for consistent text styling',
      });
    }

    if (!tokens.some(t => t.category === 'semantic')) {
      findings.push({
        id: 'token-missing-semantic',
        type: 'info',
        message: 'Consider adding semantic tokens for better abstraction',
        severity: 'low',
        suggestion: 'Create semantic tokens (e.g., primary-color, error-color) that reference base tokens',
      });
    }

    const typeBreakdown = Object.entries(tokenTypes)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    findings.push({
      id: 'token-inventory',
      type: 'info',
      message: `Token inventory: ${tokens.length} unique tokens (${typeBreakdown})`,
      severity: 'low',
    });
  }

  private addCoverageFindings(
    report: TokenCoverageReport,
    findings: Finding[],
    utilityBridge: string | null
  ): void {
    const { coverageMetrics, hardcodedValues, redundancies, componentUsage, sourceFilesScanned } = report;

    // Unused tokens
    if (utilityBridge) {
      const usedCount = coverageMetrics.totalTokens - coverageMetrics.unusedTokens.length;
      findings.push({
        id: 'token-coverage-indirect',
        type: 'info',
        message:
          `${utilityBridge} consumes tokens through generated utility classes, so direct token references ` +
          `(${usedCount}/${coverageMetrics.totalTokens} tokens referenced directly) are not a reliable coverage measure. ` +
          `Coverage is excluded from the token score for this project.`,
        severity: 'low',
        suggestion:
          'To measure real adoption in a utility-class system, audit which theme scales the generated classes come from (e.g. Tailwind theme config vs arbitrary values).',
      });
    } else if (coverageMetrics.unusedTokens.length > 0) {
      const unusedPct = (coverageMetrics.unusedTokens.length / coverageMetrics.totalTokens) * 100;
      const usedCount = coverageMetrics.totalTokens - coverageMetrics.unusedTokens.length;

      let severity: Finding['severity'] = 'low';
      let suggestion =
        'Some tokens are unused. This may be acceptable for theme variations or future-proofing; audit tokens marked as unused to confirm they are intentionally reserved.';
      if (unusedPct > 70) {
        severity = 'high';
        suggestion =
          'Most tokens are never referenced. Common causes: generated tokens that were never adopted, or components styled with hardcoded values instead of var(--token-name) references.';
      } else if (unusedPct > 50) {
        severity = 'medium';
        suggestion =
          'Over half of tokens are unused. Check whether components use hardcoded values instead of token references (var(--token-name), theme paths).';
      }

      findings.push({
        id: 'token-unused-tokens',
        type: unusedPct > 50 ? 'warning' : 'info',
        message: `Token usage: ${usedCount}/${coverageMetrics.totalTokens} tokens are referenced (${coverageMetrics.coveragePercentage.toFixed(1)}% coverage); ${coverageMetrics.unusedTokens.length} (${unusedPct.toFixed(1)}%) are never referenced.`,
        severity,
        suggestion,
      });
    }

    // Hardcoded values that exactly (or near-exactly, for colors) match tokens
    const replaceable = hardcodedValues.filter(hv => hv.matchedToken);
    if (replaceable.length > 0) {
      const examples = replaceable
        .slice(0, 3)
        .map(hv => `${hv.value} → var(${hv.matchedToken})`)
        .join('; ');
      findings.push({
        id: 'token-hardcoded-matches',
        type: 'warning',
        message: `${replaceable.length} distinct hardcoded value${replaceable.length === 1 ? '' : 's'} match existing tokens and could be replaced with token references`,
        severity: replaceable.length > 10 ? 'high' : 'medium',
        suggestion: `Replace with token references, e.g.: ${examples}. These matches are reported as suggestions only — they are not counted as token usage.`,
      });
    }

    // Overall hardcoded pressure
    const unmatched = hardcodedValues.length - replaceable.length;
    if (hardcodedValues.length > 0) {
      const totalOccurrences = hardcodedValues.reduce((sum, hv) => sum + hv.files.length, 0);
      findings.push({
        id: 'token-hardcoded-values',
        type: 'warning',
        message: `${hardcodedValues.length} distinct hardcoded style values (${totalOccurrences}+ occurrences) across ${sourceFilesScanned} source files; ${unmatched} have no matching token.`,
        severity: hardcodedValues.length / Math.max(sourceFilesScanned, 1) > 1 ? 'high' : 'medium',
        suggestion: 'Tokenize recurring colors, spacing, and typography values. Values with no matching token may indicate gaps in the token scale.',
      });
    }

    // Redundant tokens (visually identical colors, identical dimensions)
    if (redundancies.length > 0) {
      findings.push({
        id: 'token-redundancies',
        type: 'info',
        message: `${redundancies.length} sets of tokens have visually identical or duplicate values`,
        severity: 'low',
        suggestion: 'Consider consolidating duplicates, or expressing them as aliases so the relationship is explicit.',
      });
    }

    // Components with low token adoption
    const lowCoverage = componentUsage.filter(cu => cu.coverageScore < 50);
    if (lowCoverage.length > 0) {
      const worst = lowCoverage
        .slice(0, 5)
        .map(c => `${c.componentName} (${c.coverageScore.toFixed(0)}%)`)
        .join(', ');
      findings.push({
        id: 'token-low-component-coverage',
        type: 'warning',
        message: `${lowCoverage.length} component${lowCoverage.length === 1 ? '' : 's'} use more hardcoded values than tokens (< 50% coverage)`,
        severity: 'medium',
        suggestion: `Worst offenders: ${worst}. Replace hardcoded colors, spacing, and typography with design token references.`,
      });
    }

    if (!utilityBridge && coverageMetrics.coveragePercentage > 80) {
      findings.push({
        id: 'token-good-coverage',
        type: 'success',
        message: `Strong token coverage: ${coverageMetrics.coveragePercentage.toFixed(1)}% of tokens are referenced in source`,
        severity: 'low',
      });
    }
  }

  /**
   * Detect a utility-class engine that consumes tokens at build time. Returns
   * the engine name for reporting, or null when tokens are consumed directly.
   */
  private async detectUtilityClassBridge(): Promise<string | null> {
    try {
      const info = await this.scanner.detectProjectInfo();
      if (info.dependencies.includes('tailwindcss')) return 'Tailwind CSS';
      if (info.dependencies.includes('unocss')) return 'UnoCSS';
      if (info.dependencies.includes('windicss')) return 'Windi CSS';
    } catch {
      // Detection is best-effort; fall through to direct-coverage mode.
    }
    return null;
  }

  /**
   * Token score — three independent signals, each counted exactly once:
   *
   *   coveragePoints  (0–45) = 45 × usedTokens / totalTokens
   *   hardcodedPoints (0–35) = 35 × max(0, 1 − pressure / 2)
   *       where pressure = distinct hardcoded style values / source files
   *       scanned (2+ distinct hardcoded values per source file scores 0)
   *   structurePoints (0–20) = +8 if color tokens exist,
   *                            +6 if spacing tokens exist,
   *                            +6 if typography tokens exist
   *
   *   score = round(coveragePoints + hardcodedPoints + structurePoints)
   *
   * No tokens at all → 0. Both 0 and 100 are reachable. There are no
   * token-count bonuses: inventory size is reported, never rewarded.
   */
  private calculateScore(
    tokens: TokenInfo[],
    coverageReport: TokenCoverageReport | undefined,
    findings: Finding[],
    utilityBridge: string | null
  ): number {
    if (tokens.length === 0) return 0;

    // Coverage (0–45)
    let coveragePoints = 0;
    if (coverageReport && coverageReport.coverageMetrics.totalTokens > 0) {
      coveragePoints =
        45 * (coverageReport.coverageMetrics.usedTokens / coverageReport.coverageMetrics.totalTokens);
    }

    // Hardcoded pressure (0–35)
    let hardcodedPoints = 35;
    if (coverageReport && coverageReport.sourceFilesScanned > 0) {
      const pressure = coverageReport.hardcodedValues.length / coverageReport.sourceFilesScanned;
      hardcodedPoints = 35 * Math.max(0, 1 - pressure / 2);
    }

    // Structure (0–20)
    const tokenTypes = this.categorizeTokens(tokens);
    const structurePoints =
      (tokenTypes.color > 0 ? 8 : 0) +
      (tokenTypes.spacing > 0 ? 6 : 0) +
      (tokenTypes.typography > 0 ? 6 : 0);

    let score: number;
    let breakdownMessage: string;
    if (utilityBridge) {
      // Direct-reference coverage is unmeasurable under a utility-class
      // engine — renormalize over the two signals we CAN measure rather than
      // scoring an invalid one (same pattern as PerformanceAuditor without
      // build output).
      score = Math.max(0, Math.min(100, Math.round(((hardcodedPoints + structurePoints) / 55) * 100)));
      breakdownMessage =
        `Score breakdown — hardcoded-value pressure: ${hardcodedPoints.toFixed(1)}/35, structure: ${structurePoints}/20, ` +
        `renormalized to /100. Direct-reference coverage is excluded: ${utilityBridge} consumes tokens via generated utility classes.`;
    } else {
      score = Math.max(0, Math.min(100, Math.round(coveragePoints + hardcodedPoints + structurePoints)));
      breakdownMessage = `Score breakdown — coverage: ${coveragePoints.toFixed(1)}/45, hardcoded-value pressure: ${hardcodedPoints.toFixed(1)}/35, structure: ${structurePoints}/20`;
    }

    // Transparency: publish the exact breakdown alongside the score.
    findings.push({
      id: 'token-score-breakdown',
      type: 'info',
      message: breakdownMessage,
      severity: 'low',
      suggestion: 'Improve by referencing more tokens in components (coverage), replacing hardcoded style values with tokens (pressure), and covering color/spacing/typography (structure).',
    });

    return score;
  }

  private categorizeTokens(tokens: TokenInfo[]): Record<string, number> {
    const categories: Record<string, number> = {
      color: 0,
      spacing: 0,
      typography: 0,
      shadow: 0,
      border: 0,
      other: 0,
    };
    tokens.forEach(token => {
      categories[token.type]++;
    });
    return categories;
  }

  private getTokenFormats(detailedPaths: PatternGroup[]): string[] {
    const formats = new Set<string>();
    const extToFormat: Record<string, string> = {
      '.json': 'JSON',
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.scss': 'SCSS',
      '.sass': 'SCSS',
      '.css': 'CSS',
      '.less': 'LESS',
    };

    detailedPaths.forEach(group => {
      Object.keys(group.fileTypes).forEach(ext => {
        const format = extToFormat[ext.toLowerCase()];
        if (format) formats.add(format);
      });
    });

    return Array.from(formats);
  }
}
