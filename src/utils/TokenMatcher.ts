import type { TokenInfo, TokenRedundancy } from '../types/index.js';
import Color from 'color';

type ColorInstance = ReturnType<typeof Color>;

// Performance optimization: Create spatial index for colors
interface ColorBucket {
  r: number;
  g: number;
  b: number;
  tokens: Array<{ token: TokenInfo; color: ColorInstance }>;
}

// Performance optimization: Trie structure for token name matching
class TokenTrie {
  children: Map<string, TokenTrie> = new Map();
  tokens: TokenInfo[] = [];
  
  insert(name: string, token: TokenInfo): void {
    const parts = name.toLowerCase().split(/[.-_]/);
    let current: TokenTrie = this;
    
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, new TokenTrie());
      }
      current = current.children.get(part) as TokenTrie;
    }
    
    current.tokens.push(token);
  }
  
  search(query: string): TokenInfo[] {
    const parts = query.toLowerCase().split(/[.-_]/);
    let current: TokenTrie = this;
    
    for (const part of parts) {
      if (!current.children.has(part)) {
        return [];
      }
      current = current.children.get(part) as TokenTrie;
    }
    
    return current.tokens;
  }
  
  fuzzySearch(query: string, maxResults: number = 10): TokenInfo[] {
    const results: TokenInfo[] = [];
    const queryParts = query.toLowerCase().split(/[.-_]/);
    
    this._fuzzySearchRecursive(queryParts, 0, [], results, maxResults);
    
    return results;
  }
  
  private _fuzzySearchRecursive(
    queryParts: string[], 
    queryIndex: number, 
    currentPath: string[], 
    results: TokenInfo[], 
    maxResults: number
  ): void {
    if (results.length >= maxResults) return;
    
    if (queryIndex >= queryParts.length) {
      results.push(...this.tokens);
      return;
    }
    
    const queryPart = queryParts[queryIndex];
    
    // Exact match
    if (this.children.has(queryPart)) {
      this.children.get(queryPart)!._fuzzySearchRecursive(
        queryParts, queryIndex + 1, [...currentPath, queryPart], results, maxResults
      );
    }
    
    // Partial matches
    for (const [key, child] of this.children) {
      if (key.includes(queryPart) || queryPart.includes(key)) {
        child._fuzzySearchRecursive(
          queryParts, queryIndex + 1, [...currentPath, key], results, maxResults
        );
      }
    }
  }
}

export class TokenMatcher {
  // Optimized data structures for O(1) lookups
  private colorTokensMap: Map<string, TokenInfo> = new Map();
  private spacingTokensMap: Map<string, TokenInfo> = new Map();
  private typographyTokensMap: Map<string, TokenInfo> = new Map();
  private otherTokensMap: Map<string, TokenInfo> = new Map();
  private allTokensSet: Set<TokenInfo> = new Set();
  
  // Enhanced token name mapping with O(1) lookups
  private tokenNameMap: Map<string, TokenInfo> = new Map();
  private semanticMap: Map<string, TokenInfo> = new Map();
  private cssPropertyMap: Map<string, TokenInfo> = new Map(); // CSS custom property mapping
  
  // Performance optimization: Spatial indexing for colors
  private colorSpatialIndex: Map<string, ColorBucket> = new Map();
  private readonly COLOR_BUCKET_SIZE = 32; // Group colors in 32x32x32 buckets
  
  // Performance optimization: Trie for fast token name searches
  private tokenTrie: TokenTrie = new TokenTrie();
  
  // Performance optimization: Compiled regex patterns
  private static readonly COMPILED_PATTERNS = {
    tailwindColor: /^(bg|text|border|from|to|via)[-_]([a-z]+)[-_]?(\d+)?$/,
    componentVariant: /^[a-z]+[-_]([a-z]+)$/,
    spacing: /^[pm][-_]?(\d+)$|^space[-_][xy][-_]?(\d+)$/,
    textSize: /^text[-_](xs|sm|base|lg|xl|\d+xl)$/,
    color: /^#[0-9a-f]{3,8}$/i,
    rgbColor: /^rgba?\(/i,
    hslColor: /^hsla?\(/i,
    spacingValue: /^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|ex)$/,
    calcValue: /^calc\(/i,
    numericValue: /^(\d+(?:\.\d+)?)/
  };
  
  // Performance optimization: Memoization cache
  private memoCache = {
    exactMatch: new Map<string, TokenInfo | undefined>(),
    approximateMatch: new Map<string, { token: TokenInfo; similarity: number } | undefined>(),
    colorSimilarity: new Map<string, number>(),
    clearCache: () => {
      this.memoCache.exactMatch.clear();
      this.memoCache.approximateMatch.clear();
      this.memoCache.colorSimilarity.clear();
    }
  };

  constructor(tokens: TokenInfo[]) {
    this.buildOptimizedIndexes(tokens);
  }

  private buildOptimizedIndexes(tokens: TokenInfo[]): void {
    const startTime = performance.now();
    
    // Clear existing indexes
    this.clearIndexes();
    
    // Build all indexes in parallel where possible
    const colorTokens: Array<{ token: TokenInfo; color: ColorInstance }> = [];
    
    tokens.forEach(token => {
      this.allTokensSet.add(token);
      
      // Build type-specific maps
      const normalizedValue = token.value.toLowerCase();
      switch (token.type) {
        case 'color':
          this.colorTokensMap.set(normalizedValue, token);
          // Prepare for spatial indexing
          try {
            const color = Color(token.value);
            colorTokens.push({ token, color });
          } catch {
            // Skip invalid colors
          }
          break;
        case 'spacing':
          this.spacingTokensMap.set(token.value, token);
          break;
        case 'typography':
          this.typographyTokensMap.set(token.value, token);
          break;
        default:
          this.otherTokensMap.set(token.value, token);
      }
      
      // Build name-based indexes
      this.buildNameMappings(token);
      
      // Build trie index
      this.tokenTrie.insert(token.name, token);
    });
    
    // Build spatial index for colors
    this.buildColorSpatialIndex(colorTokens);
    
    console.log(`[TokenMatcher] Built optimized indexes for ${tokens.length} tokens in ${(performance.now() - startTime).toFixed(2)}ms`);
  }
  
  private clearIndexes(): void {
    this.colorTokensMap.clear();
    this.spacingTokensMap.clear();
    this.typographyTokensMap.clear();
    this.otherTokensMap.clear();
    this.allTokensSet.clear();
    this.tokenNameMap.clear();
    this.semanticMap.clear();
    this.cssPropertyMap.clear();
    this.colorSpatialIndex.clear();
    this.tokenTrie = new TokenTrie();
    this.memoCache.clearCache();
  }

  private buildNameMappings(token: TokenInfo): void {
    const tokenNameLower = token.name.toLowerCase();
    
    // Map by full name
    this.tokenNameMap.set(tokenNameLower, token);
    
    // Build CSS custom property mappings
    this.buildCSSPropertyMappings(token);
    
    // Map by various name variations for fast semantic lookup
    const nameParts = tokenNameLower.split(/[.-_]/);
    if (nameParts.length > 1) {
      const lastPart = nameParts[nameParts.length - 1];
      const firstPart = nameParts[0];
      
      // Only store if not already mapped to avoid conflicts
      if (!this.semanticMap.has(lastPart)) {
        this.semanticMap.set(lastPart, token);
      }
      if (!this.semanticMap.has(firstPart)) {
        this.semanticMap.set(firstPart, token);
      }
    }
    
    // Map shorthand versions
    if (tokenNameLower.includes('color')) {
      const colorName = tokenNameLower.replace(/color[.-_]/i, '');
      if (!this.semanticMap.has(colorName)) {
        this.semanticMap.set(colorName, token);
      }
    }
    
    if (tokenNameLower.includes('spacing') || tokenNameLower.includes('space')) {
      const spaceName = tokenNameLower.replace(/spac(ing|e)[.-_]/i, '');
      if (!this.semanticMap.has(spaceName)) {
        this.semanticMap.set(spaceName, token);
      }
    }
  }

  /**
   * Build CSS custom property mappings for different naming conventions
   */
  private buildCSSPropertyMappings(token: TokenInfo): void {
    const tokenPath = token.name.toLowerCase();
    
    // Generate various CSS custom property conventions
    const cssProperties: string[] = [
      // Standard: --color-primary-500
      `--${tokenPath.replace(/\./g, '-')}`,
      
      // Altitude-style: --al-theme-color-primary-500
      `--al-theme-${tokenPath.replace(/\./g, '-')}`,
      
      // Alternative: --al-color-primary-500
      `--al-${tokenPath.replace(/\./g, '-')}`,
      
      // Theme-prefixed: --theme-color-primary-500
      `--theme-${tokenPath.replace(/\./g, '-')}`,
      
      // Bootstrap-style: --bs-primary-500
      `--bs-${tokenPath.replace(/\./g, '-')}`,
      
      // Material-style: --md-sys-color-primary
      `--md-sys-${tokenPath.replace(/\./g, '-')}`,
    ];
    
    // Add semantic shortcuts for deep tokens
    const pathParts = tokenPath.split('.');
    if (pathParts.length > 2) {
      // --primary-500 from color.primary.500
      cssProperties.push(`--${pathParts.slice(1).join('-')}`);
    }
    
    // Map all variations to the token
    for (const cssProp of cssProperties) {
      if (!this.cssPropertyMap.has(cssProp)) {
        this.cssPropertyMap.set(cssProp, token);
      }
    }
  }

  private buildColorSpatialIndex(colorTokens: Array<{ token: TokenInfo; color: ColorInstance }>): void {
    for (const { token, color } of colorTokens) {
      try {
        const [r, g, b] = color.rgb().array();
        const bucketKey = this.getColorBucketKey(r, g, b);
        
        if (!this.colorSpatialIndex.has(bucketKey)) {
          this.colorSpatialIndex.set(bucketKey, {
            r: Math.floor(r / this.COLOR_BUCKET_SIZE) * this.COLOR_BUCKET_SIZE,
            g: Math.floor(g / this.COLOR_BUCKET_SIZE) * this.COLOR_BUCKET_SIZE,
            b: Math.floor(b / this.COLOR_BUCKET_SIZE) * this.COLOR_BUCKET_SIZE,
            tokens: []
          });
        }
        
        this.colorSpatialIndex.get(bucketKey)!.tokens.push({ token, color });
      } catch {
        // Skip invalid colors
      }
    }
  }

  private getColorBucketKey(r: number, g: number, b: number): string {
    const bucketR = Math.floor(r / this.COLOR_BUCKET_SIZE);
    const bucketG = Math.floor(g / this.COLOR_BUCKET_SIZE);
    const bucketB = Math.floor(b / this.COLOR_BUCKET_SIZE);
    return `${bucketR},${bucketG},${bucketB}`;
  }

  findExactMatch(value: string, type?: string): TokenInfo | undefined {
    // Performance optimization: Use memoization
    const cacheKey = `${value}:${type || 'any'}`;
    if (this.memoCache.exactMatch.has(cacheKey)) {
      return this.memoCache.exactMatch.get(cacheKey);
    }

    const normalizedValue = value.trim().toLowerCase();
    let result: TokenInfo | undefined;

    // Check if this is a CSS custom property first
    if (normalizedValue.startsWith('var(--') || normalizedValue.startsWith('--')) {
      const cssProp = normalizedValue.replace(/^var\(/, '').replace(/\)$/, '');
      result = this.cssPropertyMap.get(cssProp);
      if (result) {
        this.memoCache.exactMatch.set(cacheKey, result);
        return result;
      }
    }

    // Fast path: Direct lookup by type
    if (type === 'color' || this.isColorValue(value)) {
      result = this.colorTokensMap.get(normalizedValue);
    } else if (type === 'spacing' || this.isSpacingValue(value)) {
      result = this.spacingTokensMap.get(value);
    } else {
      // Check all maps in priority order
      result = this.colorTokensMap.get(normalizedValue) ||
               this.spacingTokensMap.get(value) ||
               this.typographyTokensMap.get(value) ||
               this.otherTokensMap.get(value);
    }

    // Cache the result
    this.memoCache.exactMatch.set(cacheKey, result);
    return result;
  }

  findApproximateMatch(value: string, type?: string, threshold: number = 0.9): { token: TokenInfo; similarity: number } | undefined {
    // Performance optimization: Use memoization
    const cacheKey = `${value}:${type || 'any'}:${threshold}`;
    if (this.memoCache.approximateMatch.has(cacheKey)) {
      return this.memoCache.approximateMatch.get(cacheKey);
    }

    const normalizedValue = value.trim().toLowerCase();
    let result: { token: TokenInfo; similarity: number } | undefined;

    if (type === 'color' || this.isColorValue(value)) {
      result = this.findApproximateColorMatchOptimized(normalizedValue, threshold);
    } else if (type === 'spacing' || this.isSpacingValue(value)) {
      result = this.findApproximateSpacingMatchOptimized(value, threshold);
    }

    // Cache the result
    this.memoCache.approximateMatch.set(cacheKey, result);
    return result;
  }

  private findApproximateColorMatchOptimized(value: string, threshold: number): { token: TokenInfo; similarity: number } | undefined {
    try {
      const targetColor = Color(value);
      const [r, g, b] = targetColor.rgb().array();
      
      let bestMatch: { token: TokenInfo; similarity: number } | undefined;
      
      // Performance optimization: Use spatial indexing to check only nearby colors
      const searchRadius = 2; // Check neighboring buckets
      const baseBucketR = Math.floor(r / this.COLOR_BUCKET_SIZE);
      const baseBucketG = Math.floor(g / this.COLOR_BUCKET_SIZE);
      const baseBucketB = Math.floor(b / this.COLOR_BUCKET_SIZE);
      
      for (let dr = -searchRadius; dr <= searchRadius; dr++) {
        for (let dg = -searchRadius; dg <= searchRadius; dg++) {
          for (let db = -searchRadius; db <= searchRadius; db++) {
            const bucketKey = `${baseBucketR + dr},${baseBucketG + dg},${baseBucketB + db}`;
            const bucket = this.colorSpatialIndex.get(bucketKey);
            
            if (!bucket) continue;
            
            for (const { token, color } of bucket.tokens) {
              const similarity = this.calculateColorSimilarityOptimized(targetColor, color);
              
              if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
                bestMatch = { token, similarity };
              }
            }
          }
        }
      }

      return bestMatch;
    } catch {
      return undefined;
    }
  }

  private calculateColorSimilarityOptimized(color1: ColorInstance, color2: ColorInstance): number {
    // Performance optimization: Use memoization for color similarity
    const cacheKey = `${color1.hex()}:${color2.hex()}`;
    if (this.memoCache.colorSimilarity.has(cacheKey)) {
      return this.memoCache.colorSimilarity.get(cacheKey)!;
    }

    // Performance optimization: Use faster LAB color space for perceptual accuracy
    try {
      const lab1 = color1.lab().array();
      const lab2 = color2.lab().array();
      
      // Delta E CIE76 formula (simplified for performance)
      const deltaL = lab1[0] - lab2[0];
      const deltaA = lab1[1] - lab2[1];
      const deltaB = lab1[2] - lab2[2];
      
      const deltaE = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
      
      // Convert to 0-1 range (Delta E of 2.3 or less is considered similar)
      const similarity = Math.max(0, 1 - (deltaE / 100));
      
      // Cache the result
      this.memoCache.colorSimilarity.set(cacheKey, similarity);
      return similarity;
    } catch {
      // Fallback to RGB if LAB fails
      const rgb1 = color1.rgb().array();
      const rgb2 = color2.rgb().array();

      const distance = Math.sqrt(
        Math.pow(rgb1[0] - rgb2[0], 2) +
        Math.pow(rgb1[1] - rgb2[1], 2) +
        Math.pow(rgb1[2] - rgb2[2], 2)
      );

      const similarity = 1 - (distance / (Math.sqrt(3) * 255));
      this.memoCache.colorSimilarity.set(cacheKey, similarity);
      return similarity;
    }
  }

  private findApproximateSpacingMatchOptimized(value: string, threshold: number): { token: TokenInfo; similarity: number } | undefined {
    const numericValue = this.extractNumericValueOptimized(value);
    if (numericValue === null) return undefined;

    let bestMatch: { token: TokenInfo; similarity: number } | undefined;

    // Performance optimization: Use Map.forEach which is faster than for-of
    this.spacingTokensMap.forEach((token) => {
      const tokenNumeric = this.extractNumericValueOptimized(token.value);
      if (tokenNumeric === null) return;

      const similarity = this.calculateNumericSimilarity(numericValue, tokenNumeric);

      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { token, similarity };
      }
    });

    return bestMatch;
  }

  private calculateNumericSimilarity(value1: number, value2: number): number {
    const diff = Math.abs(value1 - value2);
    const maxValue = Math.max(value1, value2);

    if (maxValue === 0) return 1;

    return 1 - (diff / maxValue);
  }

  findRedundantTokens(threshold: number = 0.95): TokenRedundancy[] {
    // Performance optimization: Use spatial indexing to reduce O(n²) to approximately O(n log n)
    const redundancies: TokenRedundancy[] = [];
    const processedTokens = new Set<string>();

    // Optimized color redundancy detection using spatial index
    this.colorSpatialIndex.forEach((bucket) => {
      const bucketTokens = bucket.tokens;
      
      // Only check within bucket (tokens are already spatially close)
      for (let i = 0; i < bucketTokens.length; i++) {
        const token1 = bucketTokens[i];
        
        if (processedTokens.has(token1.token.name)) continue;
        
        for (let j = i + 1; j < bucketTokens.length; j++) {
          const token2 = bucketTokens[j];
          
          if (processedTokens.has(token2.token.name)) continue;
          
          try {
            const similarity = this.calculateColorSimilarityOptimized(token1.color, token2.color);

            if (similarity >= threshold) {
              redundancies.push({
                tokens: [
                  { name: token1.token.name, value: token1.token.value },
                  { name: token2.token.name, value: token2.token.value }
                ],
                type: 'color',
                similarity,
                suggestion: `Consider consolidating ${token1.token.name} and ${token2.token.name}`
              });
              
              processedTokens.add(token1.token.name);
              processedTokens.add(token2.token.name);
            }
          } catch {
            // Skip invalid colors
          }
        }
      }
    });

    // Optimized spacing redundancy detection
    const spacingTokens = Array.from(this.spacingTokensMap.values());
    const processedSpacingTokens = new Set<string>();
    
    for (let i = 0; i < spacingTokens.length; i++) {
      const token1 = spacingTokens[i];
      
      if (processedSpacingTokens.has(token1.name)) continue;
      
      const value1 = this.extractNumericValueOptimized(token1.value);
      if (value1 === null) continue;
      
      for (let j = i + 1; j < spacingTokens.length; j++) {
        const token2 = spacingTokens[j];
        
        if (processedSpacingTokens.has(token2.name)) continue;
        
        const value2 = this.extractNumericValueOptimized(token2.value);
        if (value2 === null) continue;

        const similarity = this.calculateNumericSimilarity(value1, value2);

        if (similarity >= threshold) {
          redundancies.push({
            tokens: [
              { name: token1.name, value: token1.value },
              { name: token2.name, value: token2.value }
            ],
            type: 'spacing',
            similarity,
            suggestion: `Consider consolidating ${token1.name} and ${token2.name}`
          });
          
          processedSpacingTokens.add(token1.name);
          processedSpacingTokens.add(token2.name);
        }
      }
    }

    return redundancies;
  }

  isColorValue(value: string): boolean {
    const trimmedValue = value.trim();
    return TokenMatcher.COMPILED_PATTERNS.color.test(trimmedValue) ||
           TokenMatcher.COMPILED_PATTERNS.rgbColor.test(trimmedValue) ||
           TokenMatcher.COMPILED_PATTERNS.hslColor.test(trimmedValue);
  }

  isSpacingValue(value: string): boolean {
    const trimmedValue = value.trim();
    return TokenMatcher.COMPILED_PATTERNS.spacingValue.test(trimmedValue) ||
           TokenMatcher.COMPILED_PATTERNS.calcValue.test(trimmedValue);
  }

  private extractNumericValueOptimized(value: string): number | null {
    const match = TokenMatcher.COMPILED_PATTERNS.numericValue.exec(value);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Optimized token finding by CSS class name using compiled patterns and trie search
   */
  findTokenByClassName(className: string): TokenInfo | undefined {
    const lowerClass = className.toLowerCase();
    
    // Fast path: Direct semantic mapping
    const directMatch = this.semanticMap.get(lowerClass);
    if (directMatch) return directMatch;
    
    // Fast path: Compiled pattern matching
    for (const [patternName, pattern] of Object.entries(TokenMatcher.COMPILED_PATTERNS)) {
      if (patternName.includes('Color') || patternName.includes('Spacing') || patternName.includes('Size')) {
        const match = lowerClass.match(pattern);
        if (match) {
          const semantic = match[2] || match[1];
          const variant = match[3];
          
          // Try semantic match
          let token = this.semanticMap.get(semantic);
          if (token) return token;
          
          // Try composite match
          if (variant) {
            const composite = `${semantic}.${variant}`;
            token = this.tokenNameMap.get(composite);
            if (token) return token;
          }
        }
      }
    }
    
    // Fallback: Trie-based fuzzy search
    const fuzzyResults = this.tokenTrie.fuzzySearch(lowerClass, 1);
    return fuzzyResults.length > 0 ? fuzzyResults[0] : undefined;
  }
  
  /**
   * Optimized token finding by component prop value
   */
  findTokenByPropValue(propName: string, propValue: string, context?: string): TokenInfo | undefined {
    const lowerProp = propName.toLowerCase();
    const lowerValue = propValue.toLowerCase();
    
    // Fast path: Direct semantic lookup
    const directMatch = this.semanticMap.get(lowerValue);
    if (directMatch && this.isPropRelevantToTokenType(lowerProp, directMatch.type)) {
      return directMatch;
    }
    
    // Performance optimization: Pre-defined prop type mapping
    const relevantTypes = this.getRelevantTokenTypes(lowerProp);
    
    // Search tokens of relevant types using optimized maps
    for (const type of relevantTypes) {
      const typeTokens = this.getTokensByTypeOptimized(type);
      for (const token of typeTokens) {
        if (token.name.toLowerCase().includes(lowerValue) || 
            token.value.toLowerCase() === lowerValue) {
          return token;
        }
      }
    }
    
    return undefined;
  }
  
  private getRelevantTokenTypes(propName: string): string[] {
    // Performance optimization: Use Map for O(1) lookup
    const propTypeMap = new Map([
      ['color', ['color']],
      ['background', ['color']], 
      ['variant', ['color']],
      ['theme', ['color']],
      ['size', ['spacing', 'typography']],
      ['spacing', ['spacing']],
      ['margin', ['spacing']],
      ['padding', ['spacing']],
      ['gap', ['spacing']],
      ['font', ['typography']],
      ['text', ['typography']],
    ]);
    
    return propTypeMap.get(propName) || [];
  }
  
  private isPropRelevantToTokenType(propName: string, tokenType: string): boolean {
    const relevanceMap = new Map([
      ['color', new Set(['color', 'background', 'bg', 'variant', 'theme'])],
      ['spacing', new Set(['size', 'spacing', 'margin', 'padding', 'gap', 'space'])],
      ['typography', new Set(['font', 'text', 'size', 'weight'])],
      ['shadow', new Set(['shadow', 'elevation'])],
      ['border', new Set(['border', 'radius'])],
    ]);
    
    const relevantProps = relevanceMap.get(tokenType);
    return relevantProps ? Array.from(relevantProps).some(prop => propName.includes(prop)) : false;
  }
  
  /**
   * Optimized class name extraction
   */
  extractClassNames(classNameValue: string): string[] {
    // Performance optimization: Single regex replace chain
    return classNameValue
      .replace(/[`'"]/g, '')
      .replace(/\$\{[^}]*\}/g, '') // Remove template literal expressions
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(name => name.length > 0);
  }
  
  /**
   * Optimized API reference token finding
   */
  findTokenByAPIReference(reference: string): TokenInfo | undefined {
    const lowerRef = reference.toLowerCase();
    
    // Performance optimization: Compiled patterns
    const apiPatterns = [
      /(?:theme|tokens|designsystem|ds)[.]([a-z]+)[.]([a-z0-9.-]+)/i,
      /(?:colors|spacing|typography|shadows)[.]([a-z0-9.-]+)/i,
    ];
    
    for (const pattern of apiPatterns) {
      const match = lowerRef.match(pattern);
      if (match) {
        const tokenPath = match[2] || match[1];
        
        // Fast lookups in order of likelihood
        return this.tokenNameMap.get(tokenPath) ||
               this.semanticMap.get(tokenPath) ||
               this.findTokenByNameContains(tokenPath);
      }
    }
    
    return undefined;
  }
  
  private findTokenByNameContains(query: string): TokenInfo | undefined {
    // Performance optimization: Use trie for fast substring search
    const results = this.tokenTrie.fuzzySearch(query, 1);
    return results.length > 0 ? results[0] : undefined;
  }
  
  private getTokensByTypeOptimized(type: string): TokenInfo[] {
    switch (type) {
      case 'color':
        return Array.from(this.colorTokensMap.values());
      case 'spacing':
        return Array.from(this.spacingTokensMap.values());
      case 'typography':
        return Array.from(this.typographyTokensMap.values());
      default:
        return Array.from(this.otherTokensMap.values());
    }
  }
  
  getAllTokensByType(type: string): TokenInfo[] {
    return this.getTokensByTypeOptimized(type);
  }
  
  getAllTokens(): TokenInfo[] {
    return Array.from(this.allTokensSet);
  }

  // Performance monitoring methods
  getCacheStats(): { hits: number; misses: number; size: number } {
    return {
      hits: 0, // Could track this if needed
      misses: 0,
      size: this.memoCache.exactMatch.size + this.memoCache.approximateMatch.size + this.memoCache.colorSimilarity.size
    };
  }

  clearCache(): void {
    this.memoCache.clearCache();
  }
}
