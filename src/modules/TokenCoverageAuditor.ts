import { promises as fs } from 'fs';
import path from 'path';
import type {
  AuditConfig,
  TokenInfo,
  TokenUsageInfo,
  HardcodedValue,
  TokenCoverageMetrics,
  ComponentTokenUsage,
  TokenRedundancy
} from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';
import { TokenMatcher } from '../utils/TokenMatcher.js';
import { TokenParser } from '../utils/TokenParser.js';
import { StyleDictionaryDetector, type TokenTransformPattern } from '../utils/StyleDictionaryDetector.js';

export interface TokenCoverageReport {
  usageMapping: TokenUsageInfo[];
  hardcodedValues: HardcodedValue[];
  redundancies: TokenRedundancy[];
  coverageMetrics: TokenCoverageMetrics;
  componentUsage: ComponentTokenUsage[];
}

// Component type classification for better coverage calculation
export type ComponentType = 'layout' | 'button' | 'input' | 'text' | 'card' | 'navigation' | 'unknown';

// Extended ComponentTokenUsage with needs attention logic
export interface ExtendedComponentTokenUsage extends ComponentTokenUsage {
  needsAttention: boolean;
  attentionReasons: string[];
  componentType: ComponentType;
  relevantTokenCount: number;
}

export class TokenCoverageAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;
  private tokens: TokenInfo[];
  private tokenMatcher: TokenMatcher;
  private tokenUsageMap: Map<string, TokenUsageInfo> = new Map();
  private transformPattern: TokenTransformPattern | null = null;
  private styleDictionaryDetector: StyleDictionaryDetector;

  constructor(config: AuditConfig, tokens: TokenInfo[]) {
    this.config = config;
    this.scanner = new FileScanner(config);
    this.tokens = tokens;
    this.tokenMatcher = new TokenMatcher(tokens);
    this.styleDictionaryDetector = new StyleDictionaryDetector(config.projectPath);
  }

  async analyzeCoverage(): Promise<TokenCoverageReport> {
    // Detect Style Dictionary configuration and patterns
    await this.detectTransformPatterns();

    // Initialize token usage map
    this.initializeTokenUsageMap();

    // Scan source files for token usage and hardcoded values
    const hardcodedValues = await this.scanSourceFiles();

    // Find redundant tokens
    const redundancies = this.tokenMatcher.findRedundantTokens();

    // Calculate coverage metrics
    const coverageMetrics = this.calculateCoverageMetrics();

    // Analyze component-level usage
    const componentUsage = await this.analyzeComponentUsage();

    return {
      usageMapping: Array.from(this.tokenUsageMap.values()),
      hardcodedValues,
      redundancies,
      coverageMetrics,
      componentUsage
    };
  }

  private async detectTransformPatterns(): Promise<void> {
    try {
      // First try to find Style Dictionary config files
      const configFiles = await this.styleDictionaryDetector.detectConfigFiles();

      if (configFiles.length > 0) {
        console.log(`📚 Found Style Dictionary config: ${configFiles[0]}`);
        this.transformPattern = await this.styleDictionaryDetector.parseTransformPatterns(configFiles[0]);
      } else {
        // Fallback to detecting patterns from CSS files
        console.log('📚 No Style Dictionary config found, detecting patterns from CSS...');
        this.transformPattern = await this.styleDictionaryDetector.detectPatternsFromCSS();
      }

      if (this.transformPattern) {
        console.log(`📐 Detected token pattern:`, {
          prefix: this.transformPattern.prefix,
          caseStyle: this.transformPattern.caseStyle,
          separator: this.transformPattern.separator
        });
      }
    } catch (error) {
      console.warn('Could not detect Style Dictionary patterns:', error);
      // Use default pattern
      this.transformPattern = {
        caseStyle: 'kebab',
        separator: '-'
      };
    }
  }

  private initializeTokenUsageMap(): void {
    // First, create usage entries for all tokens
    this.tokens.forEach(token => {
      this.tokenUsageMap.set(token.name, {
        tokenName: token.name,
        tokenValue: token.value,
        usageCount: 0,
        files: []
      });
    });

    // Second pass: mark tokens as used if they're referenced by other tokens
    this.tokens.forEach(token => {
      if (token.aliasOf) {
        // This token references another token
        const referencedToken = this.tokenUsageMap.get(token.aliasOf);
        if (referencedToken) {
          referencedToken.usageCount++;
          referencedToken.files.push({
            path: token.path,
            context: `Referenced by token: ${token.name}`
          });
        }
      }
    });
  }

  private async scanSourceFiles(): Promise<HardcodedValue[]> {
    const hardcodedValues: Map<string, HardcodedValue> = new Map();

    // Enhanced patterns for source files including web components
    const sourcePatterns = [
      // Component files
      '**/components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      '**/src/**/*.{js,jsx,ts,tsx,vue,svelte}',
      '**/app/**/*.{js,jsx,ts,tsx}',
      '**/pages/**/*.{js,jsx,ts,tsx}',

      // Web component patterns (Altitude-style)
      '**/*.component.ts',
      '**/web-components/**/*.ts',
      '**/libs/*/components/**/*.ts',
      '**/packages/*/components/**/*.ts',

      // Style files (INCLUDING CSS MODULES)
      '**/components/**/*.{css,scss,sass,less}',
      '**/components/**/*.module.{css,scss,sass,less}',
      '**/src/**/*.{css,scss,sass,less}',
      '**/src/**/*.module.{css,scss,sass,less}',
      '**/styles/**/*.{css,scss,sass,less}',
      '**/libs/*/components/**/*.{css,scss,sass,less}',
      
      // Template files that might contain token usage
      '**/*.html',
      '**/*.hbs',
      '**/*.handlebars',
      '**/*.template.html',
      
      // Exclusions
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
      '!**/.next/**',
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.stories.*',
      '!**/*.d.ts',
      '!**/*.generated.*',
      '!**/*.min.*'
    ];

    const files = await this.scanner.scanFiles(sourcePatterns);

    for (const file of files) {
      await this.scanFileForTokens(file.path, hardcodedValues);
    }

    return Array.from(hardcodedValues.values());
  }

  private async scanFileForTokens(filePath: string, hardcodedValues: Map<string, HardcodedValue>): Promise<void> {
    const content = await this.scanner.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Use enhanced parsing based on file type
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      await this.scanJSFileForTokens(filePath, content, hardcodedValues);
    } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
      await this.scanCSSFileForTokens(filePath, content, hardcodedValues);
    } else {
      // Fallback to original line-by-line scanning
      await this.scanFileLineByLine(filePath, content, hardcodedValues);
    }
  }

  private async scanJSFileForTokens(filePath: string, content: string, hardcodedValues: Map<string, HardcodedValue>): Promise<void> {
    // Parse JavaScript/TypeScript for comprehensive token detection
    const parsed = TokenParser.parseJSForTokens(content);

    // Process className usage
    for (const { classes, line, context } of parsed.classNames) {
      for (const className of classes) {
        const matchedToken = this.tokenMatcher.findTokenByClassName(className);
        if (matchedToken) {
          const usage = this.tokenUsageMap.get(matchedToken.name);
          if (usage) {
            usage.usageCount++;
            usage.files.push({
              path: filePath,
              line,
              context: `CSS class: ${context}`
            });
          }
        } else {
          // Potential hardcoded class that should use tokens
          this.recordPotentialHardcodedClass(className, filePath, line, context, hardcodedValues);
        }
      }
    }

    // Process API references (theme.colors.primary, tokens.spacing.lg)
    for (const { reference, line, context } of parsed.apiReferences) {
      const matchedToken = this.tokenMatcher.findTokenByAPIReference(reference);
      if (matchedToken) {
        const usage = this.tokenUsageMap.get(matchedToken.name);
        if (usage) {
          usage.usageCount++;
          usage.files.push({
            path: filePath,
            line,
            context: `API reference: ${context}`
          });
        }
      }
      
      // Also check for direct token references in the API path
      const allReferences = TokenParser.extractAllTokenReferences(reference);
      for (const ref of allReferences) {
        const usage = this.tokenUsageMap.get(ref);
        if (usage) {
          usage.usageCount++;
          usage.files.push({
            path: filePath,
            line,
            context: `Token reference in API: ${context}`
          });
        }
      }
    }

    // Process component prop usage
    for (const { prop, value, line, context } of parsed.propUsages) {
      const matchedToken = this.tokenMatcher.findTokenByPropValue(prop, value);
      if (matchedToken) {
        const usage = this.tokenUsageMap.get(matchedToken.name);
        if (usage) {
          usage.usageCount++;
          usage.files.push({
            path: filePath,
            line,
            context: `Component prop: ${context}`
          });
        }
      }
    }

    // Fallback to original inline style detection
    await this.scanFileLineByLine(filePath, content, hardcodedValues);
  }

  private async scanCSSFileForTokens(filePath: string, content: string, hardcodedValues: Map<string, HardcodedValue>): Promise<void> {
    // Parse CSS for custom properties and references
    const parsed = TokenParser.parseCSSForTokens(content);

    // Debug logging for AvatarIndicator
    if (filePath.includes('AvatarIndicator')) {
      console.log(`[DEBUG] Scanning AvatarIndicator CSS file: ${filePath}`);
      console.log(`[DEBUG] Found ${parsed.usages.length} CSS variable usages:`);
      parsed.usages.forEach(usage => {
        console.log(`  - ${usage.name} at line ${usage.line}`);
      });
    }

    // Process CSS custom property usages
    for (const { name, line, context } of parsed.usages) {
      // For CSS variables, we should track them by their actual CSS variable name
      // not by some other token name

      // Check if we already have a usage entry for this CSS variable name
      let usage = this.tokenUsageMap.get(name);

      if (!usage) {
        // Try to find if this CSS variable exists in our tokens
        const tokenWithThisCSS = this.tokens.find(t =>
          t.name === name ||
          t.value === name ||
          // Check if the token's value references this CSS variable
          (typeof t.value === 'string' && t.value.includes(name))
        );

        if (tokenWithThisCSS || this.isCSSTokenInSystem(name)) {
          // Create a new usage entry for this CSS variable
          usage = {
            tokenName: name,
            tokenValue: '',  // We'll set this if we find the actual value
            usageCount: 0,
            files: []
          };
          this.tokenUsageMap.set(name, usage);
        }
      }

      if (usage) {
        usage.usageCount++;
        usage.files.push({
          path: filePath,
          line,
          context: `CSS variable: ${context}`
        });

        if (filePath.includes('AvatarIndicator')) {
          console.log(`  ✓ Tracking usage of ${name}`);
        }
      } else if (filePath.includes('AvatarIndicator')) {
        console.log(`  ✗ ${name} not found in token system`);
      }
    }

    // Process CSS custom property definitions (might be token definitions)
    for (const { name, value, line } of parsed.definitions) {
      const normalizedValue = this.normalizeValue(value);
      
      // Check if the value matches an existing token
      const exactMatch = this.tokenMatcher.findExactMatch(normalizedValue);
      if (exactMatch) {
        const usage = this.tokenUsageMap.get(exactMatch.name);
        if (usage) {
          usage.usageCount++;
          usage.files.push({
            path: filePath,
            line,
            context: `CSS custom property definition references token`
          });
        }
      }
    }

    // Fallback to line-by-line scanning for other CSS values
    await this.scanFileLineByLine(filePath, content, hardcodedValues);
  }

  private async scanFileLineByLine(filePath: string, content: string, hardcodedValues: Map<string, HardcodedValue>): Promise<void> {
    const lines = content.split('\n');
    const ext = path.extname(filePath).toLowerCase();

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Skip comments
      if (this.isComment(line, ext)) continue;

      // Extract style values based on file type
      const styleValues = this.extractStyleValues(line, ext);

      for (const { property, value, context } of styleValues) {
        const normalizedValue = this.normalizeValue(value);
        
        // Check if this is a token reference (e.g., var(--token) or {token.path})
        if (TokenParser.isTokenReference(normalizedValue)) {
          const referencedTokenName = TokenParser.extractTokenReference(normalizedValue);
          if (referencedTokenName) {
            // Try to find the referenced token
            const usage = this.tokenUsageMap.get(referencedTokenName);
            if (usage) {
              usage.usageCount++;
              usage.files.push({
                path: filePath,
                line: lineNum + 1,
                context: `Used as reference: ${context}`
              });
            }
          }
          continue; // Skip further processing for references
        }
        
        // Check if value matches a token directly
        const exactMatch = this.tokenMatcher.findExactMatch(normalizedValue, property);
        
        if (exactMatch) {
          // Token is being used
          const usage = this.tokenUsageMap.get(exactMatch.name);
          if (usage) {
            usage.usageCount++;
            usage.files.push({
              path: filePath,
              line: lineNum + 1,
              context
            });
          }
        } else {
          // Check for approximate matches
          const approxMatch = this.tokenMatcher.findApproximateMatch(normalizedValue, property);
          
          if (approxMatch && approxMatch.similarity >= 0.9) {
            // Value closely matches a token but doesn't use it
            const key = `${normalizedValue}-${property}`;
            
            if (!hardcodedValues.has(key)) {
              hardcodedValues.set(key, {
                value: normalizedValue,
                type: this.detectValueType(property, normalizedValue),
                files: [],
                matchedToken: approxMatch.token.name,
                similarity: approxMatch.similarity
              });
            }
            
            hardcodedValues.get(key)!.files.push({
              path: filePath,
              line: lineNum + 1,
              context
            });
          } else if (this.isHardcodableValue(normalizedValue, property)) {
            // Hardcoded value with no matching token
            const key = `${normalizedValue}-${property}`;
            
            if (!hardcodedValues.has(key)) {
              hardcodedValues.set(key, {
                value: normalizedValue,
                type: this.detectValueType(property, normalizedValue),
                files: []
              });
            }
            
            hardcodedValues.get(key)!.files.push({
              path: filePath,
              line: lineNum + 1,
              context
            });
          }
        }
      }
    }
  }

  /**
   * Record potentially hardcoded CSS classes that could use design tokens
   */
  private recordPotentialHardcodedClass(
    className: string, 
    filePath: string, 
    line: number, 
    context: string,
    hardcodedValues: Map<string, HardcodedValue>
  ): void {
    // Check if this looks like a utility class that should use tokens
    const utilityPatterns = [
      /^(bg|text|border)-([a-z]+)-(\d+)$/, // bg-blue-500, text-red-300
      /^(p|m|px|py|mx|my)-(\d+)$/, // p-4, mx-2
      /^text-(xs|sm|base|lg|xl|\d+xl)$/, // text-lg, text-2xl
      /^font-(thin|light|normal|medium|semibold|bold|black)$/ // font-medium
    ];

    const isUtilityClass = utilityPatterns.some(pattern => pattern.test(className));
    
    if (isUtilityClass) {
      const key = `class-${className}`;
      
      if (!hardcodedValues.has(key)) {
        hardcodedValues.set(key, {
          value: className,
          type: this.inferTypeFromClassName(className),
          files: []
        });
      }
      
      hardcodedValues.get(key)!.files.push({
        path: filePath,
        line,
        context: `CSS class: ${context}`
      });
    }
  }

  /**
   * Infer token type from CSS class name
   */
  private inferTypeFromClassName(className: string): HardcodedValue['type'] {
    if (className.match(/^(bg|text|border)-/)) return 'color';
    if (className.match(/^(p|m|px|py|mx|my|space)-/)) return 'spacing';
    if (className.match(/^text-/)) return 'typography';
    if (className.match(/^shadow-/)) return 'shadow';
    if (className.match(/^(border|rounded)-/)) return 'border';
    return 'other';
  }

  /**
   * Generate CSS custom property mapping for tokens
   * Handles different naming conventions: --al-theme-color-brand-red-500, --color-primary-500, etc.
   */
  private generateTokenToCSSMapping(): Map<string, string[]> {
    const mapping = new Map<string, string[]>();
    
    for (const token of this.tokens) {
      const customProperties: string[] = [];
      const tokenPath = token.name.toLowerCase();
      
      // Generate different CSS custom property variations
      // Standard convention: --color-primary-500
      const standardProp = `--${tokenPath.replace(/\./g, '-')}`;
      customProperties.push(standardProp);
      
      // Altitude-style: --al-theme-color-primary-500
      const altitudeProp = `--al-theme-${tokenPath.replace(/\./g, '-')}`;
      customProperties.push(altitudeProp);
      
      // Alternative: --al-color-primary-500 (without theme)
      const altProp = `--al-${tokenPath.replace(/\./g, '-')}`;
      customProperties.push(altProp);
      
      // Bootstrap/Tailwind style: --bs-primary-500
      const bsProp = `--bs-${tokenPath.replace(/\./g, '-')}`;
      customProperties.push(bsProp);
      
      // Material Design style: --md-sys-color-primary
      const mdProp = `--md-sys-${tokenPath.replace(/\./g, '-')}`;
      customProperties.push(mdProp);
      
      // Semantic tokens: if token contains semantic names, create shortcuts
      const pathParts = tokenPath.split('.');
      if (pathParts.length > 2) {
        // Create semantic shortcuts like --primary-500 from color.primary.500
        const semanticProp = `--${pathParts.slice(1).join('-')}`;
        customProperties.push(semanticProp);
      }
      
      mapping.set(token.name, customProperties);
    }
    
    return mapping;
  }

  /**
   * Find token by CSS custom property name using enhanced mapping
   */
  private isCSSTokenInSystem(cssVarName: string): boolean {
    // Check if this CSS variable name exists in our token system
    // This includes tokens parsed from CSS files
    return this.tokens.some(t =>
      t.name === cssVarName ||
      (typeof t.value === 'string' && t.value === cssVarName)
    );
  }

  private findTokenByCustomPropertyName(customPropName: string): TokenInfo | undefined {
    // Direct match first - tokens might be stored with their CSS names
    const directToken = this.tokens.find(t => t.name === customPropName);
    if (directToken) {
      return directToken;
    }

    const cleanProp = customPropName.toLowerCase().replace(/^--/, '');

    // Try direct match without prefix
    for (const token of this.tokens) {
      if (token.name.toLowerCase() === cleanProp || token.name === customPropName) {
        return token;
      }
    }

    // If we have a detected pattern, use it to match tokens
    if (this.transformPattern && this.transformPattern.prefix) {
      // Remove the detected prefix and try to match
      const withoutPrefix = cleanProp.replace(new RegExp(`^${this.transformPattern.prefix}[-_]?`), '');

      for (const token of this.tokens) {
        // Try to match the token name without the CSS variable prefix
        const tokenNameClean = token.name.toLowerCase().replace(/^--/, '');

        // Check if this could be the same token with different formatting
        if (this.areTokenNamesEquivalent(withoutPrefix, tokenNameClean)) {
          return token;
        }

        // Generate possible CSS variable names for this token
        // Extract path-like structure from token name
        const tokenPath = tokenNameClean.split(/[-_.]/);
        if (tokenPath.length > 0) {
          const possibleNames = this.styleDictionaryDetector.generateCSSVariableName(
            tokenPath,
            this.transformPattern
          );
          if (possibleNames.includes(customPropName)) {
            return token;
          }
        }
      }
    }

    // Fallback: Use the CSS mapping for comprehensive matching
    const cssMapping = this.generateTokenToCSSMapping();
    for (const [tokenName, cssProps] of cssMapping.entries()) {
      for (const cssProp of cssProps) {
        if (cssProp.toLowerCase() === `--${cleanProp}` || cssProp.toLowerCase() === customPropName.toLowerCase()) {
          return this.tokens.find(t => t.name === tokenName);
        }
      }
    }

    // Enhanced fuzzy match with pattern recognition
    const propParts = cleanProp.split(/[-_]/);

    for (const token of this.tokens) {
      const tokenParts = token.name.toLowerCase().replace(/^--/, '').split(/[.-_]/);

      // Check if most token parts are present in prop name
      const matchedParts = tokenParts.filter(part =>
        propParts.some(propPart =>
          propPart.includes(part) || part.includes(propPart) ||
          propPart === part
        )
      );

      // Consider it a match if 70% or more parts match
      if (matchedParts.length / tokenParts.length >= 0.7) {
        return token;
      }
    }

    return undefined;
  }

  /**
   * Check if two token names are equivalent despite formatting differences
   */
  private areTokenNamesEquivalent(name1: string, name2: string): boolean {
    // Normalize both names to compare
    const normalize = (name: string) => name
      .toLowerCase()
      .replace(/[-_.]/g, '')
      .replace(/\s+/g, '');

    return normalize(name1) === normalize(name2);
  }

  private isComment(line: string, ext: string): boolean {
    const trimmed = line.trim();
    
    switch (ext) {
      case '.js':
      case '.jsx':
      case '.ts':
      case '.tsx':
        return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
      case '.css':
      case '.scss':
      case '.sass':
      case '.less':
        return trimmed.startsWith('//') || trimmed.startsWith('/*');
      case '.vue':
      case '.svelte':
        return trimmed.startsWith('<!--') || trimmed.startsWith('//');
      default:
        return false;
    }
  }

  private extractStyleValues(line: string, ext: string): Array<{ property: string; value: string; context: string }> {
    const values: Array<{ property: string; value: string; context: string }> = [];

    switch (ext) {
      case '.css':
      case '.scss':
      case '.sass':
      case '.less':
        // CSS property pattern
        const cssPattern = /([a-z-]+)\s*:\s*([^;]+);/gi;
        let cssMatch;
        while ((cssMatch = cssPattern.exec(line)) !== null) {
          values.push({
            property: cssMatch[1],
            value: cssMatch[2].trim(),
            context: cssMatch[0]
          });
        }
        break;

      case '.js':
      case '.jsx':
      case '.ts':
      case '.tsx':
        // Inline style objects
        const jsStylePattern = /([a-zA-Z]+)\s*:\s*['"`]([^'"`]+)['"`]/g;
        let jsMatch;
        while ((jsMatch = jsStylePattern.exec(line)) !== null) {
          values.push({
            property: this.camelToKebab(jsMatch[1]),
            value: jsMatch[2],
            context: jsMatch[0]
          });
        }

        // styled-components template literals
        const styledPattern = /([a-z-]+)\s*:\s*([^;]+);/gi;
        let styledMatch;
        while ((styledMatch = styledPattern.exec(line)) !== null) {
          values.push({
            property: styledMatch[1],
            value: styledMatch[2].trim(),
            context: styledMatch[0]
          });
        }
        break;

      case '.vue':
      case '.svelte':
        // Similar to CSS but might be in <style> blocks
        const vuePattern = /([a-z-]+)\s*:\s*([^;]+);/gi;
        let vueMatch;
        while ((vueMatch = vuePattern.exec(line)) !== null) {
          values.push({
            property: vueMatch[1],
            value: vueMatch[2].trim(),
            context: vueMatch[0]
          });
        }
        break;
    }

    return values;
  }

  private normalizeValue(value: string): string {
    return value
      .trim()
      .replace(/['"`]/g, '')
      .replace(/\s+/g, ' ');
  }

  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
  }

  private detectValueType(property: string, value: string): 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'other' {
    if (property.includes('color') || property.includes('background') || 
        this.tokenMatcher.isColorValue(value)) {
      return 'color';
    }
    
    if (property.includes('margin') || property.includes('padding') || 
        property.includes('gap') || property.includes('space') ||
        property.includes('width') || property.includes('height') ||
        this.tokenMatcher.isSpacingValue(value)) {
      return 'spacing';
    }
    
    if (property.includes('font') || property.includes('text') || 
        property.includes('line-height')) {
      return 'typography';
    }
    
    if (property.includes('shadow')) {
      return 'shadow';
    }
    
    if (property.includes('border') || property.includes('radius')) {
      return 'border';
    }
    
    return 'other';
  }

  private isHardcodableValue(value: string, property: string): boolean {
    // Skip values that are likely not tokenizable
    if (value.includes('var(') || value.includes('calc(') || 
        value === 'inherit' || value === 'initial' || value === 'unset' ||
        value === 'auto' || value === 'none' || value === 'transparent') {
      return false;
    }

    const type = this.detectValueType(property, value);
    
    switch (type) {
      case 'color':
        return this.tokenMatcher.isColorValue(value);
      case 'spacing':
        return this.tokenMatcher.isSpacingValue(value);
      default:
        return false;
    }
  }

  private calculateCoverageMetrics(): TokenCoverageMetrics {
    const usedTokens = Array.from(this.tokenUsageMap.values())
      .filter(usage => usage.usageCount > 0);
    
    const unusedTokens = Array.from(this.tokenUsageMap.values())
      .filter(usage => usage.usageCount === 0)
      .map(usage => usage.tokenName);

    // Group by category
    const byCategory: Record<string, any> = {};
    const tokensByType = new Map<string, TokenInfo[]>();

    this.tokens.forEach(token => {
      const existing = tokensByType.get(token.type) || [];
      existing.push(token);
      tokensByType.set(token.type, existing);
    });

    tokensByType.forEach((tokens, type) => {
      const usageData = tokens.map(token => ({
        name: token.name,
        count: this.tokenUsageMap.get(token.name)?.usageCount || 0
      }));

      const used = usageData.filter(t => t.count > 0);
      
      byCategory[type] = {
        total: tokens.length,
        used: used.length,
        percentage: tokens.length > 0 ? (used.length / tokens.length) * 100 : 0,
        mostUsed: usageData
          .filter(t => t.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        leastUsed: usageData
          .filter(t => t.count > 0)
          .sort((a, b) => a.count - b.count)
          .slice(0, 5)
      };
    });

    return {
      totalTokens: this.tokens.length,
      usedTokens: usedTokens.length,
      unusedTokens,
      coveragePercentage: this.tokens.length > 0 
        ? (usedTokens.length / this.tokens.length) * 100 
        : 0,
      byCategory
    };
  }

  private async analyzeComponentUsage(): Promise<ComponentTokenUsage[]> {
    const componentUsage: ExtendedComponentTokenUsage[] = [];

    console.log('🔍 Starting component analysis...');

    // Find component files with more targeted patterns (avoid duplicates)
    const componentPatterns = [
      'src/components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      'components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      'lib/components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      'packages/*/src/components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      'packages/*/components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      'ui/**/*.{js,jsx,ts,tsx,vue,svelte}',
      // Exclude test, story, and other non-component files
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.stories.*',
      '!**/*.d.ts',
      '!**/index.{js,jsx,ts,tsx}',
      '!**/*.config.*',
      '!**/node_modules/**'
    ];

    const allFiles = await this.scanner.scanFiles(componentPatterns);

    // Manually filter out stories, tests, demos, and index files
    const componentFiles = allFiles.filter(file => {
      const fileName = path.basename(file.path);
      const fileNameLower = fileName.toLowerCase();
      const fileNameWithoutExt = path.basename(file.path, path.extname(file.path));

      const isStoryFile = fileName.includes('.stories.') || fileName.includes('.story.');
      const isTestFile = fileName.includes('.test.') || fileName.includes('.spec.') ||
                         fileNameWithoutExt.endsWith('Test') || fileNameWithoutExt.endsWith('Tests');
      const isDemoFile = fileNameLower.includes('demo') || fileNameLower.includes('showcase') ||
                        fileNameLower.includes('example') || fileNameLower.includes('fixture') ||
                        fileNameLower.includes('mock') || fileNameLower.includes('sample');
      const isIndexFile = fileNameLower === 'index.ts' || fileNameLower === 'index.tsx' ||
                         fileNameLower === 'index.js' || fileNameLower === 'index.jsx';
      const isUtilityFile = fileNameLower.includes('util') || fileNameLower.includes('helper') ||
                           fileNameLower.includes('constant') || fileNameLower.includes('types');

      return !isStoryFile && !isTestFile && !isDemoFile && !isIndexFile && !isUtilityFile;
    });

    // Deduplicate component files by path
    const uniqueComponents = new Map<string, typeof componentFiles[0]>();
    for (const file of componentFiles) {
      const key = file.path; // Use path as the unique key
      if (!uniqueComponents.has(key)) {
        uniqueComponents.set(key, file);
      }
    }
    const dedupedComponentFiles = Array.from(uniqueComponents.values());

    console.log(`📁 Found ${dedupedComponentFiles.length} component files to analyze`);

    for (const file of dedupedComponentFiles) {
      try {
        const tokensUsed = new Set<string>();
        let hardcodedCount = 0;
        const componentName = path.basename(file.path, path.extname(file.path));
        const componentType = this.classifyComponent(componentName, file.path);

        console.log(`🧩 Analyzing component: ${componentName} (${componentType})`);

        // Check which tokens are used in this component AND its CSS module
        let tokenFoundInComponent = false;

        // Also check for corresponding CSS module file
        const cssModulePath = file.path.replace(/\.(jsx?|tsx?)$/, '.module.css');
        const scssModulePath = file.path.replace(/\.(jsx?|tsx?)$/, '.module.scss');

        // Debug logging for AvatarIndicator
        if (componentName === 'AvatarIndicator') {
          console.log(`[DEBUG] Checking tokenUsageMap for AvatarIndicator component`);
          console.log(`  Component file: ${file.path}`);
          console.log(`  CSS module path: ${cssModulePath}`);
        }

        for (const [tokenName, usage] of this.tokenUsageMap.entries()) {
          const usedInComponent = usage.files.some(f =>
            f.path === file.path ||
            f.path === cssModulePath ||
            f.path === scssModulePath
          );
          if (usedInComponent) {
            tokensUsed.add(tokenName);
            tokenFoundInComponent = true;

            if (componentName === 'AvatarIndicator') {
              console.log(`  ✓ Token ${tokenName} used in component (${usage.files.length} references)`);
            }
          }
        }

        if (componentName === 'AvatarIndicator') {
          console.log(`  Total unique tokens found: ${tokensUsed.size}`);
        }

        // Also scan the CSS module file if it exists
        const cssModuleFile = file.path.replace(/\.(tsx?|jsx?)$/, '.module.css');
        const scssModuleFile = file.path.replace(/\.(tsx?|jsx?)$/, '.module.scss');

        let cssContent = '';
        try {
          // Try to read CSS module file
          cssContent = await this.scanner.readFile(cssModuleFile);
        } catch {
          try {
            // Try SCSS module as fallback
            cssContent = await this.scanner.readFile(scssModuleFile);
          } catch {
            // No CSS module file found
          }
        }

        // Count hardcoded values in both JS and CSS files
        const jsContent = await this.scanner.readFile(file.path);
        const allContent = jsContent + '\n' + cssContent;

        // Extract all style values from both files
        const hardcodedValues = await this.detectHardcodedValues(allContent, file.path);
        hardcodedCount = hardcodedValues.length;

        // NEW CALCULATION: Coverage based on token usage vs hardcoded values
        // Perfect coverage = using tokens for everything
        // Poor coverage = many hardcoded values that could be tokens

        const totalStyleValues = tokensUsed.size + hardcodedCount;
        const coverageScore = totalStyleValues > 0
          ? (tokensUsed.size / totalStyleValues) * 100
          : tokensUsed.size > 0 ? 100 : 0;

        // Determine if component needs attention
        const { needsAttention, reasons } = this.evaluateComponentAttention(
          coverageScore, 
          hardcodedCount, 
          tokensUsed.size,
          componentType
        );

        const usage: ExtendedComponentTokenUsage = {
          componentPath: file.path,
          componentName,
          tokensUsed: Array.from(tokensUsed),
          hardcodedValues: hardcodedCount,
          coverageScore,
          needsAttention,
          attentionReasons: reasons,
          componentType,
          relevantTokenCount: 0 // Not used in new calculation
        };

        componentUsage.push(usage);
        
        console.log(`✅ ${componentName}: ${coverageScore.toFixed(1)}% coverage, ${tokensUsed.size} tokens used, ${hardcodedCount} hardcoded values`);
      } catch (error) {
        console.error(`❌ Error analyzing component ${file.path}:`, error);
      }
    }

    console.log(`🏁 Component analysis complete. Found ${componentUsage.length} valid components.`);
    
    // Return with attention data included
    return componentUsage
      .map(({ componentType, relevantTokenCount, ...usage }) => usage)
      .sort((a, b) => a.coverageScore - b.coverageScore);
  }

  /**
   * Detect hardcoded values in CSS/JS that could/should be tokens
   */
  private async detectHardcodedValues(content: string, filePath: string): Promise<Array<{ value: string; property: string; line?: number }>> {
    const hardcodedValues: Array<{ value: string; property: string; line?: number }> = [];
    const lines = content.split('\n');

    // Patterns for values that should likely be tokens
    const patterns = {
      // Pixel values (spacing, sizes, borders)
      pixelValues: /(\d+(?:\.\d+)?px)/g,
      // Rem/em values (spacing, font sizes)
      remEmValues: /(\d+(?:\.\d+)?(?:rem|em))/g,
      // Color values (hex, rgb, hsl)
      hexColors: /(#[0-9a-fA-F]{3,8})/g,
      rgbColors: /(rgba?\([^)]+\))/g,
      hslColors: /(hsla?\([^)]+\))/g,
      // Timing values (animations, transitions)
      timingValues: /(\d+(?:\.\d+)?(?:ms|s))/g,
      // Border radius percentages (except 50% for circles)
      borderRadius: /border-radius:\s*(\d+(?:\.\d+)?%|[\d.]+(?:px|rem|em))/gi,
      // Box shadows with explicit values
      boxShadow: /box-shadow:\s*([^;]+)/gi,
      // Font weights as numbers
      fontWeights: /font-weight:\s*(\d{3})/gi,
      // Line heights as numbers or units
      lineHeights: /line-height:\s*([\d.]+(?:px|rem|em)?)/gi,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
        continue;
      }

      // Skip lines that are using CSS variables
      if (line.includes('var(--')) {
        continue;
      }

      // Check for pixel values in CSS properties
      if (line.match(/(?:width|height|padding|margin|gap|top|left|right|bottom|font-size|border-width):/i)) {
        const pixelMatches = line.match(patterns.pixelValues);
        if (pixelMatches) {
          pixelMatches.forEach(value => {
            // Skip 0px and 1px for borders (often intentional)
            if (value !== '0px' && !(value === '1px' && line.includes('border'))) {
              hardcodedValues.push({
                value,
                property: this.extractPropertyFromLine(line),
                line: lineNum
              });
            }
          });
        }
      }

      // Check for color values
      const hexMatches = line.match(patterns.hexColors);
      if (hexMatches) {
        hexMatches.forEach(value => {
          hardcodedValues.push({
            value,
            property: this.extractPropertyFromLine(line),
            line: lineNum
          });
        });
      }

      const rgbMatches = line.match(patterns.rgbColors);
      if (rgbMatches) {
        rgbMatches.forEach(value => {
          hardcodedValues.push({
            value,
            property: this.extractPropertyFromLine(line),
            line: lineNum
          });
        });
      }

      // Check for timing values
      if (line.match(/(?:transition|animation|duration|delay):/i)) {
        const timingMatches = line.match(patterns.timingValues);
        if (timingMatches) {
          timingMatches.forEach(value => {
            hardcodedValues.push({
              value,
              property: this.extractPropertyFromLine(line),
              line: lineNum
            });
          });
        }
      }

      // Check for font weights
      const fontWeightMatches = line.match(patterns.fontWeights);
      if (fontWeightMatches) {
        hardcodedValues.push({
          value: fontWeightMatches[1],
          property: 'font-weight',
          line: lineNum
        });
      }
    }

    return hardcodedValues;
  }

  /**
   * Extract CSS property name from a line
   */
  private extractPropertyFromLine(line: string): string {
    const match = line.match(/([a-z-]+)\s*:/i);
    return match ? match[1] : 'unknown';
  }

  private extractAllStyleValues(content: string, ext: string): Array<{ property: string; value: string }> {
    const allValues: Array<{ property: string; value: string }> = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const values = this.extractStyleValues(line, ext);
      allValues.push(...values.map(v => ({ property: v.property, value: v.value })));
    }

    return allValues;
  }

  /**
   * Classify component type based on name and path for better coverage calculation
   */
  private classifyComponent(componentName: string, componentPath: string): ComponentType {
    const nameLower = componentName.toLowerCase();
    const pathLower = componentPath.toLowerCase();
    
    // Layout components - typically need fewer design tokens
    if (nameLower.includes('layout') || nameLower.includes('container') || 
        nameLower.includes('wrapper') || nameLower.includes('grid') ||
        pathLower.includes('/layout/')) {
      return 'layout';
    }
    
    // Buttons - typically use color, spacing, typography tokens
    if (nameLower.includes('button') || nameLower.includes('btn')) {
      return 'button';
    }
    
    // Input components - need color, spacing, border tokens
    if (nameLower.includes('input') || nameLower.includes('field') ||
        nameLower.includes('form') || nameLower.includes('select') ||
        nameLower.includes('textarea')) {
      return 'input';
    }
    
    // Text components - primarily typography tokens
    if (nameLower.includes('text') || nameLower.includes('heading') ||
        nameLower.includes('title') || nameLower.includes('label') ||
        nameLower.includes('typography')) {
      return 'text';
    }
    
    // Card components - use spacing, border, shadow tokens
    if (nameLower.includes('card') || nameLower.includes('panel') ||
        nameLower.includes('tile')) {
      return 'card';
    }
    
    // Navigation components - use color and spacing tokens
    if (nameLower.includes('nav') || nameLower.includes('menu') ||
        nameLower.includes('breadcrumb') || nameLower.includes('tab') ||
        pathLower.includes('/navigation/')) {
      return 'navigation';
    }
    
    return 'unknown';
  }

  /**
   * Get relevant tokens for a specific component type
   */
  private getRelevantTokensForComponent(componentType: ComponentType): TokenInfo[] {
    const allTokens = this.tokens;
    
    switch (componentType) {
      case 'button':
        return allTokens.filter(t => 
          t.type === 'color' || t.type === 'spacing' || t.type === 'typography' || t.type === 'border'
        );
      
      case 'input':
        return allTokens.filter(t => 
          t.type === 'color' || t.type === 'spacing' || t.type === 'border'
        );
      
      case 'text':
        return allTokens.filter(t => t.type === 'typography' || t.type === 'color');
      
      case 'card':
        return allTokens.filter(t => 
          t.type === 'spacing' || t.type === 'border' || t.type === 'shadow' || t.type === 'color'
        );
      
      case 'navigation':
        return allTokens.filter(t => t.type === 'color' || t.type === 'spacing');
      
      case 'layout':
        return allTokens.filter(t => t.type === 'spacing');
      
      default:
        // For unknown components, consider tokens that are commonly used
        return allTokens.filter(t => 
          t.type === 'color' || t.type === 'spacing' || t.type === 'typography'
        );
    }
  }

  /**
   * Evaluate if a component needs attention based on multiple criteria
   * New logic: Focus on hardcoded values rather than arbitrary coverage percentages
   */
  private evaluateComponentAttention(
    coverageScore: number,
    hardcodedCount: number,
    tokensUsedCount: number,
    componentType: ComponentType
  ): { needsAttention: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // NEW EVALUATION CRITERIA:
    // Good: 100% coverage (no hardcoded values)
    // Acceptable: 80%+ coverage (few hardcoded values)
    // Needs attention: <80% coverage (many hardcoded values)

    // Check for poor coverage (too many hardcoded values)
    if (coverageScore < 80) {
      reasons.push(`Token coverage only ${coverageScore.toFixed(1)}% - ${hardcodedCount} hardcoded values found`);
    }

    // Check for high number of hardcoded values (absolute threshold)
    if (hardcodedCount > 10) {
      reasons.push(`High number of hardcoded values (${hardcodedCount})`);
    } else if (hardcodedCount > 5) {
      reasons.push(`Multiple hardcoded values (${hardcodedCount}) that could be tokens`);
    }

    // Zero token usage when there are style values is very bad
    if (tokensUsedCount === 0 && hardcodedCount > 0) {
      reasons.push('No design tokens used - all values are hardcoded');
    }

    // Perfect score recognition
    if (coverageScore === 100 && tokensUsedCount > 0) {
      // This is good! No reasons for attention needed
      return {
        needsAttention: false,
        reasons: []
      };
    }

    return {
      needsAttention: reasons.length > 0,
      reasons
    };
  }
}