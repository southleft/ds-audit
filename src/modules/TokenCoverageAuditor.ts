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

export interface TokenCoverageReport {
  usageMapping: TokenUsageInfo[];
  hardcodedValues: HardcodedValue[];
  redundancies: TokenRedundancy[];
  coverageMetrics: TokenCoverageMetrics;
  componentUsage: ComponentTokenUsage[];
}

export class TokenCoverageAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;
  private tokens: TokenInfo[];
  private tokenMatcher: TokenMatcher;
  private tokenUsageMap: Map<string, TokenUsageInfo> = new Map();

  constructor(config: AuditConfig, tokens: TokenInfo[]) {
    this.config = config;
    this.scanner = new FileScanner(config);
    this.tokens = tokens;
    this.tokenMatcher = new TokenMatcher(tokens);
  }

  async analyzeCoverage(): Promise<TokenCoverageReport> {
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
    
    // Patterns for source files to scan - more focused on actual components
    const sourcePatterns = [
      // Component files
      '**/components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      '**/src/**/*.{js,jsx,ts,tsx,vue,svelte}',
      '**/app/**/*.{js,jsx,ts,tsx}',
      '**/pages/**/*.{js,jsx,ts,tsx}',
      
      // Style files
      '**/components/**/*.{css,scss,sass,less}',
      '**/src/**/*.{css,scss,sass,less}',
      '**/styles/**/*.{css,scss,sass,less}',
      
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
    const componentUsage: ComponentTokenUsage[] = [];
    
    // Find component files
    const componentPatterns = [
      '**/components/**/*.{js,jsx,ts,tsx,vue,svelte}',
      '**/src/**/*.component.{js,jsx,ts,tsx}',
      '**/src/**/*.{vue,svelte}',
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.stories.*'
    ];

    const componentFiles = await this.scanner.scanFiles(componentPatterns);

    for (const file of componentFiles) {
      const tokensUsed = new Set<string>();
      let hardcodedCount = 0;

      // Check which tokens are used in this component
      for (const [tokenName, usage] of this.tokenUsageMap.entries()) {
        const usedInComponent = usage.files.some(f => f.path === file.path);
        if (usedInComponent) {
          tokensUsed.add(tokenName);
        }
      }

      // Count hardcoded values in component
      const content = await this.scanner.readFile(file.path);
      const styleValues = this.extractAllStyleValues(content, path.extname(file.path));
      
      for (const { value, property } of styleValues) {
        const normalizedValue = this.normalizeValue(value);
        const exactMatch = this.tokenMatcher.findExactMatch(normalizedValue, property);
        
        if (!exactMatch && this.isHardcodableValue(normalizedValue, property)) {
          hardcodedCount++;
        }
      }

      const totalPossibleTokens = this.tokens.filter(t => 
        t.type === 'color' || t.type === 'spacing' || t.type === 'typography'
      ).length;

      const coverageScore = totalPossibleTokens > 0
        ? (tokensUsed.size / totalPossibleTokens) * 100
        : 0;

      componentUsage.push({
        componentPath: file.path,
        componentName: path.basename(file.path, path.extname(file.path)),
        tokensUsed: Array.from(tokensUsed),
        hardcodedValues: hardcodedCount,
        coverageScore
      });
    }

    return componentUsage.sort((a, b) => a.coverageScore - b.coverageScore);
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
}