import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, CategoryResult, Finding, TokenInfo } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

export class TokenAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const tokens: TokenInfo[] = [];
    const detailedPaths: any[] = [];
    const allScannedPaths = new Set<string>();
    
    // Common token file patterns - including monorepo
    const tokenFilePatterns = [
      '**/tokens/**/*.{js,ts,json,scss,css}',
      '**/design-tokens/**/*.{js,ts,json,scss,css}',
      '**/styles/tokens/**/*.{js,ts,json,scss,css}',
      '**/theme/**/*.{js,ts,json}',
      '**/_variables.scss',
      '**/variables.{scss,css}',
      '**/tokens.{js,ts,json}',
      '**/packages/*/tokens/**/*.{js,ts,json,scss,css}',
      '**/packages/*/theme/**/*.{js,ts,json}',
    ];
    
    // CSS Custom Properties patterns
    const cssVarPatterns = [
      '**/*.css',
      '**/*.scss',
      '**/*.sass',
      '**/*.less',
      '**/packages/*/*.{css,scss,sass,less}',
    ];
    
    // Theme configuration patterns
    const themePatterns = [
      '**/theme.{js,ts,json}',
      '**/theme.config.{js,ts}',
      '**/tailwind.config.{js,ts}',
      '**/stitches.config.{js,ts}',
      '**/packages/*/theme.{js,ts,json}',
    ];
    
    const allPatterns = {
      'Token Files': tokenFilePatterns,
      'Style Files': cssVarPatterns,
      'Theme Config': themePatterns,
    };
    
    let totalFilesScanned = 0;
    
    for (const [category, patterns] of Object.entries(allPatterns)) {
      const patternResults = {
        pattern: category,
        matches: [] as string[],
        fileTypes: {} as Record<string, number>,
      };
      
      for (const pattern of patterns) {
        const files = await this.scanner.scanFiles(pattern);
        totalFilesScanned += files.length;
        
        for (const file of files) {
          patternResults.matches.push(file.path);
          allScannedPaths.add(file.directory);
          
          const ext = file.extension.toLowerCase();
          patternResults.fileTypes[ext] = (patternResults.fileTypes[ext] || 0) + 1;
          
          // Analyze token files
          if (category === 'Token Files' || (category === 'Style Files' && ext !== '.css')) {
            const fileTokens = await this.analyzeTokenFile(file.path);
            tokens.push(...fileTokens);
          }
        }
      }
      
      if (patternResults.matches.length > 0) {
        detailedPaths.push(patternResults);
      }
    }

    const filesScanned = totalFilesScanned;

    // Check for hardcoded values in style files
    const hardcodedFindings = await this.checkHardcodedValues();
    findings.push(...hardcodedFindings);

    // Analyze token usage and structure
    this.analyzeTokenStructure(tokens, findings);

    // Calculate score
    const score = this.calculateScore(tokens, findings, filesScanned);
    const grade = this.getGrade(score);

    return {
      id: 'tokens',
      name: 'Design Tokens',
      score,
      grade,
      weight: 0.20,
      findings,
      metrics: {
        filesScanned,
        totalTokens: tokens.length,
        tokenTypes: this.categorizeTokens(tokens),
        tokenFormats: this.getTokenFormats(detailedPaths),
        hardcodedValues: hardcodedFindings.length,
      },
      scannedPaths: Array.from(allScannedPaths).sort(),
      detailedPaths,
    };
  }

  private async analyzeTokenFile(filePath: string): Promise<TokenInfo[]> {
    const tokens: TokenInfo[] = [];
    const content = await this.scanner.readFile(filePath);
    const ext = path.extname(filePath);

    try {
      switch (ext) {
        case '.json':
          tokens.push(...this.parseJSONTokens(content, filePath));
          break;
        case '.js':
        case '.ts':
          tokens.push(...this.parseJSTokens(content, filePath));
          break;
        case '.scss':
        case '.sass':
          tokens.push(...this.parseSCSSTokens(content, filePath));
          break;
        case '.css':
          tokens.push(...this.parseCSSTokens(content, filePath));
          break;
      }
    } catch (error) {
      // Error parsing tokens
    }

    return tokens;
  }

  private parseJSONTokens(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    
    try {
      const data = JSON.parse(content);
      this.extractTokensFromObject(data, filePath, '', tokens);
    } catch (error) {
      // Invalid JSON
    }

    return tokens;
  }

  private extractTokensFromObject(
    obj: any,
    filePath: string,
    prefix: string,
    tokens: TokenInfo[]
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const tokenName = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !(value as any).value) {
        // Nested object, recurse
        this.extractTokensFromObject(value as any, filePath, tokenName, tokens);
      } else {
        // Token found
        const tokenValue = typeof value === 'object' && value !== null ? (value as any).value : value;
        tokens.push({
          name: tokenName,
          value: String(tokenValue),
          type: this.detectTokenType(tokenName, tokenValue),
          category: this.detectTokenCategory(tokenName),
          path: filePath,
          usage: 0, // Will be calculated later
        });
      }
    }
  }

  private parseJSTokens(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    
    // Simple regex-based extraction for JS/TS tokens
    const tokenRegex = /(?:const|let|var)\s+(\w+)\s*=\s*['"]([^'"]+)['"]|(?:const|let|var)\s+(\w+)\s*=\s*{([^}]+)}/g;
    let match;

    while ((match = tokenRegex.exec(content)) !== null) {
      if (match[1] && match[2]) {
        // Simple string token
        tokens.push({
          name: match[1],
          value: match[2],
          type: this.detectTokenType(match[1], match[2]),
          category: this.detectTokenCategory(match[1]),
          path: filePath,
          usage: 0,
        });
      }
    }

    return tokens;
  }

  private parseSCSSTokens(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    
    // Extract SCSS variables
    const variableRegex = /\$([-\w]+)\s*:\s*([^;]+);/g;
    let match;

    while ((match = variableRegex.exec(content)) !== null) {
      tokens.push({
        name: `$${match[1]}`,
        value: match[2].trim(),
        type: this.detectTokenType(match[1], match[2]),
        category: this.detectTokenCategory(match[1]),
        path: filePath,
        usage: 0,
      });
    }

    return tokens;
  }

  private parseCSSTokens(content: string, filePath: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    
    // Extract CSS custom properties
    const customPropRegex = /--([-\w]+)\s*:\s*([^;]+);/g;
    let match;

    while ((match = customPropRegex.exec(content)) !== null) {
      tokens.push({
        name: `--${match[1]}`,
        value: match[2].trim(),
        type: this.detectTokenType(match[1], match[2]),
        category: this.detectTokenCategory(match[1]),
        path: filePath,
        usage: 0,
      });
    }

    return tokens;
  }

  private detectTokenType(name: string, value: any): TokenInfo['type'] {
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

  private async checkHardcodedValues(): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Check CSS/SCSS files for hardcoded values
    const stylePatterns = [
      '**/*.{css,scss,sass}',
      '!**/node_modules/**',
      '!**/tokens/**',
      '!**/design-tokens/**',
    ];

    const files = await this.scanner.scanFiles(stylePatterns);
    
    for (const file of files.slice(0, 50)) { // Limit to first 50 files for performance
      const content = await this.scanner.readFile(file.path);
      
      // Check for hardcoded colors
      const colorRegex = /(color|background|border-color)\s*:\s*(#[0-9a-f]{3,8}|rgb|hsl)[^;]*;/gi;
      const colorMatches = content.match(colorRegex) || [];
      
      if (colorMatches.length > 0) {
        findings.push({
          id: `token-hardcoded-color-${file.path}`,
          type: 'warning',
          message: `Found ${colorMatches.length} hardcoded color values in ${file.name}`,
          severity: 'medium',
          path: file.path,
          suggestion: 'Replace hardcoded colors with design tokens',
        });
      }

      // Check for hardcoded spacing
      const spacingRegex = /(padding|margin|gap|spacing)\s*:\s*\d+px/gi;
      const spacingMatches = content.match(spacingRegex) || [];
      
      if (spacingMatches.length > 0) {
        findings.push({
          id: `token-hardcoded-spacing-${file.path}`,
          type: 'warning',
          message: `Found ${spacingMatches.length} hardcoded spacing values in ${file.name}`,
          severity: 'low',
          path: file.path,
          suggestion: 'Use spacing tokens for consistent layout',
        });
      }
    }

    return findings;
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

    // Check token organization
    const tokenTypes = this.categorizeTokens(tokens);
    
    if (!tokenTypes.color || tokenTypes.color === 0) {
      findings.push({
        id: 'token-missing-colors',
        type: 'warning',
        message: 'No color tokens defined',
        severity: 'high',
        suggestion: 'Define color tokens for consistent theming',
      });
    }

    if (!tokenTypes.spacing || tokenTypes.spacing === 0) {
      findings.push({
        id: 'token-missing-spacing',
        type: 'warning',
        message: 'No spacing tokens defined',
        severity: 'medium',
        suggestion: 'Define spacing tokens for consistent layout',
      });
    }

    if (!tokenTypes.typography || tokenTypes.typography === 0) {
      findings.push({
        id: 'token-missing-typography',
        type: 'warning',
        message: 'No typography tokens defined',
        severity: 'medium',
        suggestion: 'Define typography tokens for consistent text styling',
      });
    }

    // Check for good practices
    const hasSemanticTokens = tokens.some(t => t.category === 'semantic');
    if (!hasSemanticTokens) {
      findings.push({
        id: 'token-missing-semantic',
        type: 'info',
        message: 'Consider adding semantic tokens for better abstraction',
        severity: 'low',
        suggestion: 'Create semantic tokens (e.g., primary-color, error-color) that reference base tokens',
      });
    }

    if (tokens.length > 20) {
      findings.push({
        id: 'token-well-defined',
        type: 'success',
        message: `Well-defined token system with ${tokens.length} tokens`,
        severity: 'low',
      });
    }
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

  private getTokenFormats(detailedPaths: any[]): string[] {
    const formats = new Set<string>();
    
    detailedPaths.forEach(pathGroup => {
      if (pathGroup.fileTypes) {
        Object.keys(pathGroup.fileTypes).forEach(ext => {
          switch (ext.toLowerCase()) {
            case '.json':
              formats.add('JSON');
              break;
            case '.js':
              formats.add('JavaScript');
              break;
            case '.ts':
              formats.add('TypeScript');
              break;
            case '.scss':
            case '.sass':
              formats.add('SCSS');
              break;
            case '.css':
              formats.add('CSS');
              break;
            case '.less':
              formats.add('LESS');
              break;
          }
        });
      }
    });

    return Array.from(formats);
  }

  private calculateScore(tokens: TokenInfo[], findings: Finding[], filesScanned: number): number {
    let score = 100;

    // No tokens found is a critical issue
    if (tokens.length === 0) {
      return 0;
    }

    // Deduct points for missing token types
    const tokenTypes = this.categorizeTokens(tokens);
    if (!tokenTypes.color || tokenTypes.color === 0) score -= 20;
    if (!tokenTypes.spacing || tokenTypes.spacing === 0) score -= 15;
    if (!tokenTypes.typography || tokenTypes.typography === 0) score -= 15;

    // Deduct points for hardcoded values
    const hardcodedFindings = findings.filter(f => f.id.includes('hardcoded'));
    score -= Math.min(hardcodedFindings.length * 2, 30);

    // Deduct points for critical and high severity issues
    const criticalIssues = findings.filter(f => f.severity === 'critical').length;
    const highIssues = findings.filter(f => f.severity === 'high').length;
    
    score -= criticalIssues * 20;
    score -= highIssues * 10;

    // Bonus points for good practices
    const hasSemanticTokens = tokens.some(t => t.category === 'semantic');
    if (hasSemanticTokens) score += 5;

    // Bonus for comprehensive token system
    if (tokens.length > 50) score += 5;
    if (tokens.length > 100) score += 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}