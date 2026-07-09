import type { TokenInfo } from '../types/index.js';

export interface ParsedToken {
  name: string;
  value: string | number;
  type?: string;
  description?: string;
  $extensions?: Record<string, any>;
  aliasOf?: string;
}

export interface TokenSet {
  tokens: Map<string, ParsedToken>;
  aliases: Map<string, string>; // alias name -> referenced token name
}

/**
 * Parses design tokens from DTCG / Style Dictionary JSON files and CSS
 * custom-property files, plus lightweight per-line reference extraction
 * used by the coverage scan.
 *
 * Canonical name representation used across the whole token pipeline:
 * - CSS custom properties are ALWAYS stored and referenced WITH the leading
 *   `--` (e.g. `--color-primary`), including names extracted from `var(...)`.
 * - JSON tokens keep their dot path (e.g. `color.primary.500`).
 * - Sass variables keep their `$` prefix (e.g. `$color-primary`).
 */
export class TokenParser {
  // Anchored single-value reference patterns. Group 1 is the referenced token
  // name in the canonical representation above. The var() pattern tolerates a
  // fallback (`var(--a, 8px)`) and captures only `--a`.
  private static readonly REFERENCE_PATTERNS = [
    /^\{([^}]+)\}$/, // Style Dictionary: {colors.primary}
    /^(\$[a-zA-Z0-9-_.]+)$/, // Sass variable: $color-primary
    /^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,[\s\S]*)?\)$/, // var(--x) / var(--x, fallback)
  ];

  // Per-line scan patterns (global; used via fresh matchAll each call).
  private static readonly CSS_VAR_USAGE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,[^)]*)?\)/g;
  private static readonly JS_API_REFERENCE =
    /\b(?:theme|tokens|designSystem|ds)\.([a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+)*)/g;
  private static readonly JS_GET_TOKEN = /\b(?:getToken|token)\(\s*['"]([^'"]+)['"]\s*\)/g;

  // Keys that indicate metadata rather than actual tokens
  private static readonly METADATA_KEYS = new Set([
    // Figma-specific metadata
    '$figmavariablereferences',
    '$figmacollectionid',
    '$figmavariableid',
    'figma',
    // General metadata patterns
    'meta',
    'metadata',
    '_meta',
    '_source',
    '_description',
    '_note',
    '_version',
    // Token spec reserved keys
    '$extensions',
    '$type',
    '$description',
    '$value',
    // Documentation keys (not actual tokens)
    'description',
    'usage',
    'example',
    'examples',
    'note',
    'notes',
    'recommendations',
    'documentation',
    'docs',
    'comment',
    'comments',
    // Config/source info
    'source',
    'sources',
    'reference',
    'references',
  ]);

  // Patterns that indicate a value is documentation, not a token
  private static readonly DOCUMENTATION_PATTERNS = [
    /^https?:\/\//, // URLs
    /^[A-Z][a-z].*\.$/, // Full sentences ending with period
    /^\d+\.\d+\.\d+$/, // Version strings
    /^(Use|Set|The|This|For|If|When|How|Why|What|See|Example|Note|Description|Usage)/i,
  ];

  private static readonly colorKeywords = new Set([
    'color', 'colour', 'background', 'bg', 'fill', 'stroke',
  ]);

  private static readonly spacingKeywords = new Set([
    'spacing', 'space', 'margin', 'padding', 'gap', 'inset', 'width', 'height',
  ]);

  private static readonly typographyKeywords = new Set([
    'font', 'text', 'typography', 'weight', 'size',
  ]);

  private static readonly shadowKeywords = new Set([
    'shadow', 'elevation', 'drop-shadow',
  ]);

  private static readonly borderKeywords = new Set([
    'border', 'radius', 'stroke', 'outline',
  ]);

  private static readonly colorPatterns = /#[0-9a-f]{3,8}|rgb|hsl/i;
  private static readonly spacingPatterns = /^\d+(\.\d+)?(px|rem|em|%|vh|vw)$/;

  /**
   * Parse CSS custom properties from CSS files. Names keep the `--` prefix.
   */
  static parseCSSVariables(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    const cssVarRegex = /--([\w-]+):\s*([^;]+);/g;

    let match;
    while ((match = cssVarRegex.exec(content)) !== null) {
      const varName = `--${match[1]}`;
      const varValue = match[2].trim();

      // A value of var(--other) marks this token as an alias of --other.
      // The captured name includes `--` and excludes any fallback argument.
      const aliasMatch = varValue.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,[\s\S]*)?\)$/);

      tokens.push({
        name: varName,
        value: varValue,
        type: this.inferTokenTypeFromCSSVar(varName, varValue),
        path: filePath,
        category: this.getCategoryFromCSSVar(varName),
        usage: 0,
        aliasOf: aliasMatch ? aliasMatch[1] : undefined,
      });
    }

    return tokens;
  }

  /**
   * Parse tokens from a DTCG / Style Dictionary style JSON document.
   */
  static parseJSON(content: string, filePath: string): TokenInfo[] {
    try {
      const data = JSON.parse(content);
      const tokenSet = this.extractTokens(data);
      const resolved = this.resolveTokenReferences(tokenSet);
      return this.convertToTokenInfo(resolved, filePath);
    } catch {
      // Not valid JSON (or not a token document) — contribute no tokens.
      return [];
    }
  }

  /** All `var(--x)` names referenced on a line (with `--` prefix). */
  static extractVarUsages(line: string): string[] {
    const names: string[] = [];
    for (const match of line.matchAll(this.CSS_VAR_USAGE)) {
      names.push(match[1]);
    }
    return names;
  }

  /**
   * Token dot-paths referenced from JS/TS via theme/tokens object access
   * (`tokens.color.primary` -> `color.primary`) or `getToken('color.primary')`.
   * Only useful when the path exactly matches a parsed token name — callers
   * must do an exact lookup; nothing here is fuzzy.
   */
  static extractJSTokenReferences(line: string): string[] {
    const refs = new Set<string>();
    for (const match of line.matchAll(this.JS_API_REFERENCE)) {
      refs.add(match[1]);
    }
    for (const match of line.matchAll(this.JS_GET_TOKEN)) {
      refs.add(match[1]);
    }
    return Array.from(refs);
  }

  /** Whether a single CSS/JSON value is a reference to another token. */
  static isTokenReference(value: string): boolean {
    if (typeof value !== 'string') return false;
    return this.REFERENCE_PATTERNS.some(pattern => pattern.test(value));
  }

  /** Extract the canonical token name from a single-value reference. */
  static extractTokenReference(value: string): string | null {
    if (typeof value !== 'string') return null;
    for (const pattern of this.REFERENCE_PATTERNS) {
      const match = value.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  private static extractTokens(obj: any, prefix: string = ''): TokenSet {
    const tokens = new Map<string, ParsedToken>();
    const aliases = new Map<string, string>();

    const stack: Array<{ obj: any; prefix: string; depth: number }> = [{ obj, prefix, depth: 0 }];

    while (stack.length > 0) {
      const { obj: currentObj, prefix: currentPrefix, depth } = stack.pop()!;
      if (depth > 10) continue; // guard against pathological nesting

      for (const [key, value] of Object.entries(currentObj)) {
        if (this.METADATA_KEYS.has(key.toLowerCase())) continue;

        const currentPath = currentPrefix ? `${currentPrefix}.${key}` : key;

        if (this.isTokenObject(value)) {
          const token = this.parseTokenObject(value);
          token.name = currentPath;

          const aliasTarget = this.detectAlias(token.value);
          if (aliasTarget) {
            aliases.set(currentPath, aliasTarget);
            token.aliasOf = aliasTarget;
          }

          tokens.set(currentPath, token);
        } else if (typeof value === 'object' && value !== null) {
          if (this.looksLikeSimpleToken(value)) {
            const token: ParsedToken = {
              name: currentPath,
              value: (value as any).value || value,
              type: (value as any).type || this.inferTokenType(key, (value as any).value || value),
              description: (value as any).description,
            };

            const aliasTarget = this.detectAlias(token.value);
            if (aliasTarget) {
              aliases.set(currentPath, aliasTarget);
              token.aliasOf = aliasTarget;
            }

            tokens.set(currentPath, token);
          } else {
            stack.push({ obj: value, prefix: currentPath, depth: depth + 1 });
          }
        } else if (typeof value === 'string' || typeof value === 'number') {
          // Direct value token — but skip documentation-like values
          if (typeof value === 'string' && this.isDocumentationValue(value)) {
            continue;
          }

          const token: ParsedToken = {
            name: currentPath,
            value,
            type: this.inferTokenType(key, value),
          };

          const aliasTarget = this.detectAlias(value);
          if (aliasTarget) {
            aliases.set(currentPath, aliasTarget);
            token.aliasOf = aliasTarget;
          }

          tokens.set(currentPath, token);
        }
      }
    }

    return { tokens, aliases };
  }

  private static isTokenObject(value: any): boolean {
    return typeof value === 'object' &&
           value !== null &&
           ('value' in value || '$value' in value);
  }

  private static isDocumentationValue(value: string): boolean {
    if (value.length > 100) return true;
    return this.DOCUMENTATION_PATTERNS.some(pattern => pattern.test(value));
  }

  private static looksLikeSimpleToken(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    const keys = Object.keys(value);
    const tokenKeys = new Set(['value', '$value', 'type', '$type', 'description', '$description']);

    return keys.some(k => k === 'value' || k === '$value') &&
           keys.every(k => tokenKeys.has(k) || k.startsWith('$'));
  }

  private static parseTokenObject(obj: any): ParsedToken {
    return {
      name: '', // Set by caller
      value: obj.value || obj.$value || obj,
      type: obj.type || obj.$type,
      description: obj.description || obj.$description,
      $extensions: obj.$extensions,
    };
  }

  private static detectAlias(value: any): string | null {
    if (typeof value !== 'string') return null;
    return this.extractTokenReference(value);
  }

  private static inferTokenType(key: string, value: any): string {
    const keyLower = key.toLowerCase();
    const valueStr = String(value).toLowerCase();

    // Full path analysis for tiered tokens (e.g. typography.fontSize.lg)
    const pathParts = keyLower.split('.');
    const rootCategory = pathParts[0] || '';
    const subCategory = pathParts[1] || '';
    const leafKey = pathParts[pathParts.length - 1] || '';

    // Check typography first so fontSize tokens aren't classified as spacing
    if (this.typographyKeywords.has(rootCategory) ||
        rootCategory === 'typography' ||
        this.typographyKeywords.has(subCategory) ||
        this.typographyKeywords.has(leafKey) ||
        keyLower.includes('fontsize') || keyLower.includes('font-size') ||
        keyLower.includes('fontweight') || keyLower.includes('font-weight') ||
        keyLower.includes('lineheight') || keyLower.includes('line-height') ||
        pathParts.some(part => part === 'fontsize' || part === 'fontweight' || part === 'lineheight' ||
                              part === 'font' || part === 'text' || part === 'typography')) {
      return 'typography';
    }

    if (this.colorKeywords.has(rootCategory) || this.colorKeywords.has(subCategory) ||
        this.colorKeywords.has(leafKey) || this.colorPatterns.test(valueStr)) {
      return 'color';
    }

    if (this.spacingKeywords.has(rootCategory) || this.spacingKeywords.has(subCategory) ||
        this.spacingKeywords.has(leafKey) || this.spacingPatterns.test(valueStr)) {
      return 'spacing';
    }

    if (this.shadowKeywords.has(rootCategory) || this.shadowKeywords.has(subCategory) ||
        this.shadowKeywords.has(leafKey)) {
      return 'shadow';
    }

    if (this.borderKeywords.has(rootCategory) || this.borderKeywords.has(subCategory) ||
        this.borderKeywords.has(leafKey)) {
      return 'border';
    }

    if (keyLower.includes('font') || keyLower.includes('text') || keyLower.includes('weight') ||
        leafKey.match(/^(xs|sm|base|lg|xl|\d+xl|thin|light|normal|medium|semibold|bold|black)$/)) {
      return 'typography';
    }

    if (leafKey.match(/^\d+$/) && (rootCategory === 'space' || rootCategory === 'spacing' ||
        pathParts.some(part => this.spacingKeywords.has(part)))) {
      return 'spacing';
    }

    if (leafKey.match(/^(50|100|200|300|400|500|600|700|800|900)$/) &&
        (rootCategory === 'color' || pathParts.some(part => this.colorKeywords.has(part)))) {
      return 'color';
    }

    return 'other';
  }

  private static resolveTokenReferences(tokenSet: TokenSet): Map<string, ParsedToken> {
    const { tokens, aliases } = tokenSet;
    const resolved = new Map<string, ParsedToken>();

    tokens.forEach((token, name) => {
      resolved.set(name, { ...token });
    });

    // Record which tokens are referenced by other tokens (informational —
    // alias references never count as component usage).
    aliases.forEach((targetPath, aliasName) => {
      const targetToken = resolved.get(targetPath);
      if (targetToken) {
        if (!targetToken.$extensions) targetToken.$extensions = {};
        if (!targetToken.$extensions.referencedBy) targetToken.$extensions.referencedBy = [];
        targetToken.$extensions.referencedBy.push(aliasName);
      }
    });

    return resolved;
  }

  private static convertToTokenInfo(
    tokens: Map<string, ParsedToken>,
    filePath: string
  ): TokenInfo[] {
    const tokenInfos: TokenInfo[] = [];

    tokens.forEach((token, name) => {
      // Skip internal Figma metadata that slipped through
      const nameLower = name.toLowerCase();
      if (nameLower.includes('figmavariable') || nameLower.includes('figmacollection')) {
        return;
      }

      let category: TokenInfo['category'] = 'global';
      if (name.includes('semantic') || name.includes('component')) {
        category = 'semantic';
      } else if (token.aliasOf) {
        category = 'semantic'; // Aliases are usually semantic tokens
      }

      tokenInfos.push({
        name,
        value: String(token.value),
        type: (token.type || this.inferTokenType(name, token.value)) as TokenInfo['type'],
        category,
        path: filePath,
        usage: 0,
        ...(token.$extensions?.referencedBy && {
          referencedBy: token.$extensions.referencedBy,
        }),
        ...(token.aliasOf && {
          aliasOf: token.aliasOf,
        }),
      });
    });

    return tokenInfos;
  }

  private static inferTokenTypeFromCSSVar(varName: string, varValue: string): TokenInfo['type'] {
    const nameLower = varName.toLowerCase();
    const valueLower = varValue.toLowerCase();

    if (nameLower.includes('color') || nameLower.includes('bg') ||
        nameLower.includes('background') || nameLower.includes('fill')) {
      return 'color';
    }
    if (nameLower.includes('space') || nameLower.includes('spacing') ||
        nameLower.includes('margin') || nameLower.includes('padding') ||
        nameLower.includes('gap') || nameLower.includes('inset')) {
      return 'spacing';
    }
    if (nameLower.includes('font') || nameLower.includes('text') ||
        nameLower.includes('typography') || nameLower.includes('line-height')) {
      return 'typography';
    }
    if (nameLower.includes('shadow') || nameLower.includes('elevation')) {
      return 'shadow';
    }
    if (nameLower.includes('border') || nameLower.includes('radius') ||
        nameLower.includes('stroke') || nameLower.includes('outline')) {
      return 'border';
    }

    if (valueLower.match(/#[0-9a-f]{3,8}|rgb|hsl/)) {
      return 'color';
    }
    if (valueLower.match(/^\d+(\.\d+)?(px|rem|em|%|vh|vw)$/)) {
      return 'spacing';
    }

    return 'other';
  }

  private static getCategoryFromCSSVar(varName: string): TokenInfo['category'] {
    const nameLower = varName.toLowerCase();

    if (nameLower.includes('component') || nameLower.includes('comp-')) {
      return 'component';
    }
    if (nameLower.includes('semantic') || nameLower.includes('intent') ||
        nameLower.includes('primary') || nameLower.includes('secondary') ||
        nameLower.includes('success') || nameLower.includes('warning') ||
        nameLower.includes('error') || nameLower.includes('info')) {
      return 'semantic';
    }

    return 'global';
  }
}
