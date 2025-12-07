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
  aliases: Map<string, string>; // alias name -> referenced token
}

// Performance optimization: Cache for parsed content
interface CacheEntry {
  content: string;
  result: TokenInfo[];
  timestamp: number;
}

export class TokenParser {
  // Performance optimization: Static caches for parsed results
  private static parseCache = new Map<string, CacheEntry>();
  private static readonly CACHE_TTL = 60000; // 1 minute
  
  // Enhanced patterns for token references - Pre-compiled for performance
  private static readonly REFERENCE_PATTERNS = [
    /^\{([^}]+)\}$/, // Style Dictionary: {colors.primary}
    /^\$([a-zA-Z0-9-_.]+)$/, // Sass variable: $color-primary
    /^var\(--([^)]+)\)$/, // CSS variable: var(--color-primary)
    // CSS-in-JS patterns
    /theme\.([a-zA-Z0-9_.]+)/g, // theme.colors.primary
    /tokens\.([a-zA-Z0-9_.]+)/g, // tokens.spacing.lg
    /designSystem\.([a-zA-Z0-9_.]+)/g, // designSystem.typography.body
    // Utility function patterns
    /(?:getToken|token)\(['"]([^'"]+)['"]\)/g, // getToken('color.primary')
  ];

  // Pre-compiled regex patterns for better performance
  private static readonly COMPILED_PATTERNS = {
    className: /className\s*=\s*[{]?['"`]([^'"}`]+)['"`][}]?/g,
    apiReference: /(?:theme|tokens|designSystem|ds)\.([a-zA-Z0-9_.]+)/g,
    propUsage: /(color|variant|size|spacing|theme|background)\s*=\s*['"`]([^'"}`]+)['"`]/g,
    cssDefinition: /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g,
    cssUsage: /var\(\s*(--[a-zA-Z0-9-_]+)\s*(?:,\s*([^)]+))?\)/g,
  };

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
    /^https?:\/\//,           // URLs
    /^[A-Z][a-z].*\.$/, // Full sentences ending with period
    /^\d+\.\d+\.\d+$/,        // Version strings
    /^(Use|Set|The|This|For|If|When|How|Why|What|See|Example|Note|Description|Usage)/i, // Documentation-like text
  ];

  // Performance optimization: Pre-computed Sets for faster keyword lookup
  private static readonly colorKeywords = new Set([
    'color', 'colour', 'background', 'bg', 'fill', 'stroke'
  ]);
  
  private static readonly spacingKeywords = new Set([
    'spacing', 'space', 'margin', 'padding', 'gap', 'inset', 'width', 'height'
  ]);
  
  private static readonly typographyKeywords = new Set([
    'font', 'text', 'typography', 'weight', 'size'
  ]);
  
  private static readonly shadowKeywords = new Set([
    'shadow', 'elevation', 'drop-shadow'
  ]);
  
  private static readonly borderKeywords = new Set([
    'border', 'radius', 'stroke', 'outline'
  ]);

  // Performance optimization: Pre-compiled patterns for type detection
  private static readonly colorPatterns = /#[0-9a-f]{3,8}|rgb|hsl/i;
  private static readonly spacingPatterns = /^\d+(\.\d+)?(px|rem|em|%|vh|vw)$/;

  /**
   * Parse CSS custom properties from generated CSS files
   */
  static parseCSSVariables(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    const cssVarRegex = /--([\w-]+):\s*([^;]+);/g;

    let match;
    while ((match = cssVarRegex.exec(content)) !== null) {
      const varName = `--${match[1]}`;
      const varValue = match[2].trim();

      // Include ALL CSS variables as tokens, even those that reference other variables
      // These are semantic tokens that reference primitive tokens and are valid tokens
      tokens.push({
        name: varName,
        value: varValue,
        type: this.inferTokenTypeFromCSSVar(varName, varValue),
        path: filePath,
        category: this.getCategoryFromCSSVar(varName),
        usage: 0,
        // Mark if this is an alias/reference to another token
        aliasOf: varValue.startsWith('var(') ? varValue.replace(/var\((--[^)]+)\)/, '$1') : undefined
      });
    }

    return tokens;
  }

  /**
   * Infer token type from CSS variable name and value
   */
  private static inferTokenTypeFromCSSVar(varName: string, varValue: string): 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'other' {
    const nameLower = varName.toLowerCase();
    const valueLower = varValue.toLowerCase();
    
    // Check by name patterns
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
    
    // Check by value patterns
    if (valueLower.match(/#[0-9a-f]{3,8}|rgb|hsl/)) {
      return 'color';
    }
    if (valueLower.match(/^\d+(\.\d+)?(px|rem|em|%|vh|vw)$/)) {
      return 'spacing';
    }
    
    return 'other';
  }

  /**
   * Get category from CSS variable name
   */
  private static getCategoryFromCSSVar(varName: string): 'global' | 'semantic' | 'component' {
    // For CSS variables, most are global design tokens
    // Semantic tokens would typically have intent-based names
    // Component tokens would include component names
    
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
    
    // Most CSS custom properties are global design tokens
    return 'global';
  }

  /**
   * Parse tokens from JSON content with caching and optimized processing
   */
  static parseJSON(content: string, filePath: string): TokenInfo[] {
    // Performance optimization: Check cache first
    const cacheKey = `${filePath}:${content.length}:${this.hashString(content)}`;
    const cached = this.parseCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      if (cached.content === content) {
        return cached.result;
      }
    }

    try {
      const startTime = performance.now();
      
      const data = JSON.parse(content);
      const tokenSet = this.extractTokensOptimized(data);
      
      // Resolve aliases and count references
      const resolvedTokens = this.resolveTokenReferencesOptimized(tokenSet);
      
      // Convert to TokenInfo format
      const result = this.convertToTokenInfoOptimized(resolvedTokens, filePath);
      
      // Cache the result
      this.parseCache.set(cacheKey, {
        content,
        result,
        timestamp: Date.now()
      });
      
      console.log(`[TokenParser] Parsed ${result.length} tokens from ${filePath} in ${(performance.now() - startTime).toFixed(2)}ms`);
      
      return result;
    } catch (error) {
      console.warn(`[TokenParser] Failed to parse JSON from ${filePath}:`, error);
      return [];
    }
  }

  private static extractTokensOptimized(obj: any, prefix: string = ''): TokenSet {
    const tokens = new Map<string, ParsedToken>();
    const aliases = new Map<string, string>();
    
    // Performance optimization: Use stack-based iteration instead of recursion
    const stack: Array<{ obj: any; prefix: string; depth: number }> = [{ obj, prefix, depth: 0 }];
    
    while (stack.length > 0) {
      const { obj: currentObj, prefix: currentPrefix, depth } = stack.pop()!;
      
      // Prevent excessive nesting
      if (depth > 10) continue;
      
      // Performance optimization: Use Object.entries once and cache results
      const entries = Object.entries(currentObj);
      
      for (const [key, value] of entries) {
        // Skip metadata keys
        if (this.METADATA_KEYS.has(key.toLowerCase())) {
          continue;
        }

        const currentPath = currentPrefix ? `${currentPrefix}.${key}` : key;

        if (this.isTokenObject(value)) {
          // This is a token definition
          const token = this.parseTokenObjectOptimized(value);
          token.name = currentPath;
          
          // Check if it's an alias
          const aliasTarget = this.detectAliasOptimized(token.value);
          if (aliasTarget) {
            aliases.set(currentPath, aliasTarget);
            token.aliasOf = aliasTarget;
          }
          
          tokens.set(currentPath, token);
        } else if (typeof value === 'object' && value !== null) {
          // Nested object - could be a group or a simple token
          if (this.looksLikeSimpleToken(value)) {
            // Simple token (e.g., { "value": "#000000" })
            const token: ParsedToken = {
              name: currentPath,
              value: (value as any).value || value,
              type: (value as any).type || this.inferTokenTypeOptimized(key, (value as any).value || value),
              description: (value as any).description
            };
            
            const aliasTarget = this.detectAliasOptimized(token.value);
            if (aliasTarget) {
              aliases.set(currentPath, aliasTarget);
              token.aliasOf = aliasTarget;
            }
            
            tokens.set(currentPath, token);
          } else {
            // Token group - add to stack for processing
            stack.push({ obj: value, prefix: currentPath, depth: depth + 1 });
          }
        } else if (typeof value === 'string' || typeof value === 'number') {
          // Direct value token - but skip documentation-like values
          if (typeof value === 'string' && this.isDocumentationValue(value)) {
            continue;
          }

          const token: ParsedToken = {
            name: currentPath,
            value: value,
            type: this.inferTokenTypeOptimized(key, value)
          };

          const aliasTarget = this.detectAliasOptimized(value);
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

  /**
   * Check if a value looks like documentation rather than a token value
   */
  private static isDocumentationValue(value: string): boolean {
    // Skip very long strings (likely documentation)
    if (value.length > 100) return true;

    // Check against documentation patterns
    return this.DOCUMENTATION_PATTERNS.some(pattern => pattern.test(value));
  }

  private static looksLikeSimpleToken(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;
    
    const keys = Object.keys(value);
    const tokenKeys = new Set(['value', '$value', 'type', '$type', 'description', '$description']);
    
    // If it has a value key and mostly token-related keys, it's probably a token
    return keys.some(k => k === 'value' || k === '$value') &&
           keys.every(k => tokenKeys.has(k) || k.startsWith('$'));
  }

  private static parseTokenObjectOptimized(obj: any): ParsedToken {
    return {
      name: '', // Will be set by caller
      value: obj.value || obj.$value || obj,
      type: obj.type || obj.$type,
      description: obj.description || obj.$description,
      $extensions: obj.$extensions
    };
  }

  private static detectAliasOptimized(value: any): string | null {
    if (typeof value !== 'string') return null;
    
    // Performance optimization: Use find instead of loop for early exit
    const pattern = this.REFERENCE_PATTERNS.find(p => {
      p.lastIndex = 0; // Reset regex state
      return p.test(value);
    });
    
    if (pattern) {
      pattern.lastIndex = 0; // Reset regex state
      const match = value.match(pattern);
      return match ? match[1] : null;
    }
    
    return null;
  }

  private static inferTokenTypeOptimized(key: string, value: any): string {
    const keyLower = key.toLowerCase();
    const valueStr = String(value).toLowerCase();

    // Extract full path for tiered token analysis (e.g., color.primary.500 or typography.fontSize.lg)
    const pathParts = keyLower.split('.');
    const rootCategory = pathParts[0] || '';
    const subCategory = pathParts[1] || '';
    const leafKey = pathParts[pathParts.length - 1] || '';

    // Performance optimization: Check path structure first for tiered tokens
    // Check typography first to prevent fontSize tokens from being classified as spacing
    if (this.typographyKeywords.has(rootCategory) || 
        rootCategory === 'typography' || // Explicit check for 'typography' root
        this.typographyKeywords.has(subCategory) || 
        this.typographyKeywords.has(leafKey) ||
        keyLower.includes('fontsize') || keyLower.includes('font-size') ||
        keyLower.includes('fontweight') || keyLower.includes('font-weight') ||
        keyLower.includes('lineheight') || keyLower.includes('line-height') ||
        // Additional check for camelCase and compound words
        subCategory === 'fontsize' || subCategory === 'fontweight' || subCategory === 'lineheight' ||
        // Check for any typography-related substring in the full path
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

    // Additional checks for common patterns
    // Check for size/weight patterns in typography
    if (keyLower.includes('font') || keyLower.includes('text') || keyLower.includes('weight') || 
        leafKey.match(/^(xs|sm|base|lg|xl|\d+xl|thin|light|normal|medium|semibold|bold|black)$/)) {
      return 'typography';
    }

    // Check for numeric size patterns that might be spacing
    if (leafKey.match(/^\d+$/) && (rootCategory === 'space' || rootCategory === 'spacing' || 
        pathParts.some(part => this.spacingKeywords.has(part)))) {
      return 'spacing';
    }

    // Check for color patterns (50, 100, 200, etc. are common color scales)
    if (leafKey.match(/^(50|100|200|300|400|500|600|700|800|900)$/) && 
        (rootCategory === 'color' || pathParts.some(part => this.colorKeywords.has(part)))) {
      return 'color';
    }
    
    return 'other';
  }

  private static resolveTokenReferencesOptimized(tokenSet: TokenSet): Map<string, ParsedToken> {
    const { tokens, aliases } = tokenSet;
    const resolved = new Map<string, ParsedToken>();
    
    // Performance optimization: Use Map.forEach instead of for-of
    tokens.forEach((token, name) => {
      resolved.set(name, { ...token });
    });
    
    // Mark referenced tokens as "used" if they're referenced by other tokens
    aliases.forEach((targetPath, aliasName) => {
      const targetToken = resolved.get(targetPath);
      if (targetToken) {
        // Lazy initialization of extensions
        if (!targetToken.$extensions) {
          targetToken.$extensions = {};
        }
        if (!targetToken.$extensions.referencedBy) {
          targetToken.$extensions.referencedBy = [];
        }
        targetToken.$extensions.referencedBy.push(aliasName);
      }
    });
    
    return resolved;
  }

  private static convertToTokenInfoOptimized(
    tokens: Map<string, ParsedToken>, 
    filePath: string
  ): TokenInfo[] {
    const tokenInfos: TokenInfo[] = [];
    
    // Performance optimization: Pre-allocate array with known size
    tokenInfos.length = tokens.size;
    let index = 0;
    
    tokens.forEach((token, name) => {
      // Skip tokens that look like internal Figma metadata
      if (name.toLowerCase().includes('figmavariable') || 
          name.toLowerCase().includes('figmacollection')) {
        return;
      }
      
      // Determine category based on token structure
      let category: TokenInfo['category'] = 'global';
      if (name.includes('semantic') || name.includes('component')) {
        category = 'semantic';
      } else if (token.aliasOf) {
        category = 'semantic'; // Aliases are usually semantic tokens
      }
      
      tokenInfos[index++] = {
        name,
        value: String(token.value),
        type: (token.type || this.inferTokenTypeOptimized(name, token.value)) as TokenInfo['type'],
        category,
        path: filePath,
        usage: 0,
        // Store reference information in the token
        ...(token.$extensions?.referencedBy && {
          referencedBy: token.$extensions.referencedBy
        }),
        ...(token.aliasOf && {
          aliasOf: token.aliasOf
        })
      };
    });
    
    // Trim array to actual size (in case some tokens were skipped)
    tokenInfos.length = index;
    
    return tokenInfos;
  }

  /**
   * Check if a value in code references a token (including aliases)
   */
  static isTokenReference(value: string): boolean {
    if (typeof value !== 'string') return false;
    
    // Performance optimization: Use some() for early exit
    return this.REFERENCE_PATTERNS.some(pattern => {
      pattern.lastIndex = 0; // Reset regex state
      return pattern.test(value);
    });
  }

  /**
   * Extract the token name from a reference
   */
  static extractTokenReference(value: string): string | null {
    if (typeof value !== 'string') return null;
    
    for (const pattern of this.REFERENCE_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex state
      const match = value.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }
  
  /**
   * Extract all token references from a code string with optimized regex handling
   */
  static extractAllTokenReferences(code: string): string[] {
    const references = new Set<string>(); // Use Set to automatically handle duplicates
    
    for (const pattern of this.REFERENCE_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex state for global patterns
      
      if (pattern.global) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          if (match[1]) {
            references.add(match[1]);
          }
        }
      } else {
        const match = code.match(pattern);
        if (match && match[1]) {
          references.add(match[1]);
        }
      }
    }
    
    return Array.from(references);
  }
  
  /**
   * Parse CSS for custom property usage and definitions with optimized regex
   */
  static parseCSSForTokens(content: string): {
    definitions: Array<{ name: string; value: string; line: number }>;
    usages: Array<{ name: string; line: number; context: string }>;
  } {
    const definitions: Array<{ name: string; value: string; line: number }> = [];
    const usages: Array<{ name: string; line: number; context: string }> = [];
    
    // Performance optimization: Split lines once and process
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    for (let i = 0; i < lineCount; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Find CSS custom property definitions using compiled pattern
      this.COMPILED_PATTERNS.cssDefinition.lastIndex = 0;
      let defMatch;
      while ((defMatch = this.COMPILED_PATTERNS.cssDefinition.exec(line)) !== null) {
        definitions.push({
          name: `--${defMatch[1]}`,
          value: defMatch[2].trim(),
          line: lineNum
        });
      }
      
      // Find CSS custom property usages using compiled pattern
      this.COMPILED_PATTERNS.cssUsage.lastIndex = 0;
      let useMatch;
      while ((useMatch = this.COMPILED_PATTERNS.cssUsage.exec(line)) !== null) {
        usages.push({
          name: useMatch[1],
          line: lineNum,
          context: line.trim()
        });
      }
    }
    
    return { definitions, usages };
  }
  
  /**
   * Parse JavaScript/TypeScript for token usage patterns with optimized regex
   */
  static parseJSForTokens(content: string): {
    classNames: Array<{ classes: string[]; line: number; context: string }>;
    apiReferences: Array<{ reference: string; line: number; context: string }>;
    propUsages: Array<{ prop: string; value: string; line: number; context: string }>;
  } {
    const classNames: Array<{ classes: string[]; line: number; context: string }> = [];
    const apiReferences: Array<{ reference: string; line: number; context: string }> = [];
    const propUsages: Array<{ prop: string; value: string; line: number; context: string }> = [];
    
    // Performance optimization: Process content in chunks for large files
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    for (let i = 0; i < lineCount; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Extract className attributes using compiled pattern
      this.COMPILED_PATTERNS.className.lastIndex = 0;
      let classMatch;
      while ((classMatch = this.COMPILED_PATTERNS.className.exec(line)) !== null) {
        const classes = classMatch[1].split(/\s+/).filter(c => c.length > 0);
        if (classes.length > 0) {
          classNames.push({
            classes,
            line: lineNum,
            context: line.trim()
          });
        }
      }
      
      // Extract design system API references using compiled pattern
      this.COMPILED_PATTERNS.apiReference.lastIndex = 0;
      let apiMatch;
      while ((apiMatch = this.COMPILED_PATTERNS.apiReference.exec(line)) !== null) {
        apiReferences.push({
          reference: apiMatch[0],
          line: lineNum,
          context: line.trim()
        });
      }
      
      // Extract component props that might use tokens using compiled pattern
      this.COMPILED_PATTERNS.propUsage.lastIndex = 0;
      let propMatch;
      while ((propMatch = this.COMPILED_PATTERNS.propUsage.exec(line)) !== null) {
        propUsages.push({
          prop: propMatch[1],
          value: propMatch[2],
          line: lineNum,
          context: line.trim()
        });
      }
    }
    
    return { classNames, apiReferences, propUsages };
  }

  // Performance optimization: Simple hash function for cache keys
  private static hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString();
  }

  // Performance monitoring and cache management
  static getCacheStats(): { entries: number; totalSize: number; hitRate: number } {
    let totalSize = 0;
    this.parseCache.forEach(entry => {
      totalSize += entry.content.length;
    });
    
    return {
      entries: this.parseCache.size,
      totalSize,
      hitRate: 0 // Could track this if needed
    };
  }

  static clearCache(): void {
    this.parseCache.clear();
  }

  static clearExpiredCache(): void {
    const now = Date.now();
    this.parseCache.forEach((entry, key) => {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.parseCache.delete(key);
      }
    });
  }
}
