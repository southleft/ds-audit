import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, CategoryResult, Finding, TokenInfo } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';
import { TokenCoverageAuditor, type TokenCoverageReport } from './TokenCoverageAuditor.js';
import { TokenParser } from '../utils/TokenParser.js';

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
    
    // PRIORITY 1: CSS files with actual custom properties (including source and generated)
    const generatedCSSPatterns = [
      // Source CSS files with tokens (common patterns)
      '**/src/styles/**/*.css',           // Matches src/styles/tokens.css
      '**/styles/**/*.css',                // Matches any styles directory
      '**/tokens/**/*.css',                // Matches CSS in tokens directories
      '**/css/**/*tokens*.css',            // Matches CSS files with "tokens" in name

      // Generated/built CSS files
      'styles/dist/**/*.css',              // Matches styles/dist/css/theme/tokens*.css
      'dist/css/tokens*.css',              // Matches dist/css/tokens*.css
      'dist/**/*tokens*.css',              // Fallback for any tokens in dist
      '**/dist/**/*tokens*.css',           // Recursive search for tokens
      '**/build/**/*tokens*.css',

      // Common token file patterns
      '**/*tokens*.css',                   // Any CSS file with "tokens" in the name
      '**/*theme*.css',                    // Theme CSS files often contain tokens
      '**/*variables*.css',                // Variable CSS files

      // Exclude minified files
      '!**/*.min.css'
    ];
    
    // PRIORITY 2: Source token files (for reference, but not primary counting)
    const tokenFilePatterns = [
      // Specific token directories - including nested patterns
      '**/tokens/**/*.{json,js,ts}',      // Any tokens directory at any depth
      '**/tokens/*.{json,js,ts}',         // Direct children of tokens directory
      '**/design-tokens/**/*.{json,js,ts}',
      '**/design-tokens/*.{json,js,ts}',
      '**/tokens/!(*.d).{json,js,ts}',    // Exclude .d.ts files
      '**/design-system/tokens/**/*.{json,js,ts}',

      // Tiered token structure patterns (Altitude-style)
      '**/styles/tokens/**/*.json',
      '**/libs/*/styles/tokens/**/*.json',
      '**/packages/*/styles/tokens/**/*.json',

      // Common token file names
      'tokens.{json,js,ts}',
      'design-tokens.{json,js,ts}',
      '**/theme/tokens.{json,js,ts}',
      '**/*.tokens.{json,js,ts}',         // Files ending with .tokens

      // Style Dictionary patterns
      '**/properties/**/*.{json,js}',

      // Exclude only critical generated files
      '!**/node_modules/**',
      '!**/.next/**',
      '!**/*.generated.*',
      '!**/*.min.*',
      '!**/*.d.ts'                         // Exclude TypeScript declaration files
    ];
    
    // CSS Custom Properties patterns (other CSS files)
    const cssVarPatterns = [
      '**/*.css',
      '**/*.scss',
      '**/*.sass',
      '**/*.less',
      '**/packages/*/*.{css,scss,sass,less}',
      '!**/node_modules/**',
      '!**/*.min.css',
      '!**/*.min.scss'
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
      'Generated CSS': generatedCSSPatterns,  // Priority 1: Actual CSS custom properties
      'Token Files': tokenFilePatterns,       // Priority 2: Source token files
      'Style Files': cssVarPatterns,          // Priority 3: Other CSS files
      'Theme Config': themePatterns,
    };
    
    let totalFilesScanned = 0;
    const cssTokens: TokenInfo[] = [];  // Store CSS custom properties separately
    const jsonTokens: TokenInfo[] = []; // Store JSON tokens separately
    
    for (const [category, patterns] of Object.entries(allPatterns)) {
      const patternResults = {
        pattern: category,
        matches: [] as string[],
        fileTypes: {} as Record<string, number>,
      };
      
      for (const pattern of patterns) {
        // For CSS token files, don't exclude dist directories
        let files: any[];
        if (category === 'Generated CSS') {
          // Use custom glob for CSS files to avoid excluding dist
          const { glob } = await import('glob');
          const cssFiles = await glob(pattern, {
            cwd: this.config.projectPath,
            ignore: ['**/node_modules/**'], // Only exclude node_modules, NOT dist
            absolute: false,
          });
          files = await Promise.all(cssFiles.map(async (filePath: string) => ({
            path: filePath,
            name: path.basename(filePath),
            extension: path.extname(filePath),
            directory: path.dirname(filePath),
            size: 0,
            modified: new Date()
          })));
        } else {
          files = await this.scanner.scanFiles(pattern);
        }
        totalFilesScanned += files.length;
        
        for (const file of files) {
          patternResults.matches.push(file.path);
          allScannedPaths.add(file.directory);
          
          const ext = file.extension.toLowerCase();
          patternResults.fileTypes[ext] = (patternResults.fileTypes[ext] || 0) + 1;
          
          // Prioritize CSS files for token extraction
          if (category === 'Generated CSS' && ext === '.css') {
            // Extract CSS custom properties from generated files
            console.log(`[TokenAuditor] Found CSS file: ${file.path}`);
            const fileTokens = await this.analyzeTokenFile(file.path);
            console.log(`[TokenAuditor] Extracted ${fileTokens.length} tokens from ${file.path}`);
            cssTokens.push(...fileTokens);
          } else if (category === 'Token Files' && ext !== '.css') {
            // Only use JSON tokens if no CSS tokens found
            const fileTokens = await this.analyzeTokenFile(file.path);
            jsonTokens.push(...fileTokens);
          }
        }
      }
      
      if (patternResults.matches.length > 0) {
        detailedPaths.push(patternResults);
      }
    }
    
    // Use CSS tokens if found, otherwise fall back to JSON tokens
    if (cssTokens.length > 0) {
      // Deduplicate CSS tokens by name (same tokens appear in multiple theme files)
      const uniqueTokens = new Map<string, TokenInfo>();
      for (const token of cssTokens) {
        if (!uniqueTokens.has(token.name)) {
          uniqueTokens.set(token.name, token);
        }
      }
      const dedupedTokens = Array.from(uniqueTokens.values());
      console.log(`[TokenAuditor] Using ${dedupedTokens.length} unique CSS custom properties (from ${cssTokens.length} total)`);
      tokens.push(...dedupedTokens);
    } else if (jsonTokens.length > 0) {
      console.log(`[TokenAuditor] No CSS tokens found, using ${jsonTokens.length} JSON tokens`);
      tokens.push(...jsonTokens);
    }

    const filesScanned = totalFilesScanned;

    // Perform comprehensive token coverage analysis
    let coverageReport: TokenCoverageReport | undefined;
    if (tokens.length > 0) {
      const coverageAuditor = new TokenCoverageAuditor(this.config, tokens);
      coverageReport = await coverageAuditor.analyzeCoverage();

      // Add findings from coverage analysis
      this.addCoverageFindings(coverageReport, findings);
    }

    // Check for hardcoded values in style files (legacy method, kept for compatibility)
    const hardcodedFindings = await this.checkHardcodedValues();
    findings.push(...hardcodedFindings);

    // Analyze token usage and structure
    this.analyzeTokenStructure(tokens, findings);

    // Calculate score including coverage metrics
    const score = this.calculateScore(tokens, findings, filesScanned, coverageReport);
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
        ...(coverageReport && {
          coverage: coverageReport.coverageMetrics,
          tokenUsage: coverageReport.usageMapping,
          redundancies: coverageReport.redundancies,
          componentCoverage: coverageReport.componentUsage
        }),
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
    // Use the new TokenParser for better handling of token structures
    return TokenParser.parseJSON(content, filePath);
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
    // Use the new CSS variable parser from TokenParser
    return TokenParser.parseCSSVariables(content, filePath);
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
      // Categorize the tokens for the success message
      const tokenTypes = this.categorizeTokens(tokens);
      const typeBreakdown = Object.entries(tokenTypes)
        .filter(([_, count]) => count > 0)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');

      findings.push({
        id: 'token-well-defined',
        type: 'success',
        message: `Well-defined token system with ${tokens.length} tokens (${typeBreakdown})`,
        severity: 'low',
      });

      // Add context about multi-theme/mode token systems
      if (tokens.length > 200) {
        findings.push({
          id: 'token-multi-theme-detected',
          type: 'info',
          message: `Large token system detected (${tokens.length} tokens). This is typical for design systems with multiple themes or modes.`,
          severity: 'low',
          suggestion: 'Multi-theme token systems are expected to have many tokens. Focus on ensuring consistent usage rather than reducing token count. Unused tokens may be intentionally defined for theme variations.',
        });
      }
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

  private addCoverageFindings(coverageReport: TokenCoverageReport, findings: Finding[]): void {
    const { coverageMetrics, hardcodedValues, redundancies, componentUsage } = coverageReport;

    // Add finding for unused tokens with actionable guidance
    if (coverageMetrics.unusedTokens.length > 0) {
      const unusedPercentage = (coverageMetrics.unusedTokens.length / coverageMetrics.totalTokens) * 100;
      const usedCount = coverageMetrics.totalTokens - coverageMetrics.unusedTokens.length;
      const usedPercentage = (100 - unusedPercentage).toFixed(1);

      // Provide more context on what this means
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      let suggestion = '';

      if (unusedPercentage > 70) {
        severity = 'high';
        suggestion = `Most tokens are unused. This often indicates: (1) tokens defined for multiple themes but components only reference one, (2) generated tokens from a design tool that weren't adopted, or (3) a disconnect between token definitions and component styles. Review your CSS/SCSS files to ensure they use var(--token-name) instead of hardcoded values.`;
      } else if (unusedPercentage > 50) {
        severity = 'medium';
        suggestion = `Over half of tokens are unused. Check if components are using hardcoded values (like "#fff" or "16px") instead of token references (like "var(--color-white)" or "var(--spacing-4)"). Run a search for hardcoded hex colors and pixel values in your component styles.`;
      } else {
        suggestion = `Some tokens are unused. This may be acceptable for theme variations or future-proofing. Consider auditing tokens marked as unused to confirm they are intentionally reserved.`;
      }

      findings.push({
        id: 'token-unused-tokens',
        type: unusedPercentage > 50 ? 'warning' : 'info',
        message: `Token usage: ${usedCount}/${coverageMetrics.totalTokens} tokens are being used (${usedPercentage}% coverage). ${coverageMetrics.unusedTokens.length} tokens (${unusedPercentage.toFixed(1)}%) are defined but never referenced.`,
        severity,
        suggestion,
      });
    }

    // Add finding for hardcoded values that match tokens with specific examples
    const hardcodedWithMatches = hardcodedValues.filter(hv => hv.matchedToken);
    if (hardcodedWithMatches.length > 0) {
      // Get top examples to show
      const examples = hardcodedWithMatches.slice(0, 3).map(hv =>
        `${hv.value} → use ${hv.matchedToken}`
      ).join('; ');

      findings.push({
        id: 'token-hardcoded-matches',
        type: 'warning',
        message: `Found ${hardcodedWithMatches.length} hardcoded values that closely match existing tokens`,
        severity: 'high',
        suggestion: `Replace hardcoded values with token references. Examples: ${examples}. Search for hex colors (#xxx) and pixel values (Npx) in your stylesheets and replace with var(--token-name).`,
      });
    }

    // Add finding for redundant tokens
    if (redundancies.length > 0) {
      findings.push({
        id: 'token-redundancies',
        type: 'info',
        message: `Found ${redundancies.length} sets of potentially redundant tokens with similar values`,
        severity: 'low',
        suggestion: 'Consider consolidating similar tokens to simplify your token system. Redundant tokens increase maintenance burden and can lead to inconsistencies.',
      });
    }

    // Add finding for low coverage components with specific names
    const lowCoverageComponents = componentUsage.filter(cu => cu.coverageScore < 50);
    if (lowCoverageComponents.length > 0) {
      // Get top 5 worst components
      const worstComponents = lowCoverageComponents
        .sort((a, b) => a.coverageScore - b.coverageScore)
        .slice(0, 5)
        .map(c => `${c.componentName} (${c.coverageScore.toFixed(0)}%)`)
        .join(', ');

      findings.push({
        id: 'token-low-component-coverage',
        type: 'warning',
        message: `${lowCoverageComponents.length} components have low token usage (< 50% coverage)`,
        severity: 'medium',
        suggestion: `These components use too many hardcoded values: ${worstComponents}. Replace hardcoded colors, spacing, and typography with design token references.`,
      });
    }

    // Add positive finding for good coverage
    if (coverageMetrics.coveragePercentage > 80) {
      findings.push({
        id: 'token-good-coverage',
        type: 'success',
        message: `Excellent token coverage: ${coverageMetrics.coveragePercentage.toFixed(1)}% of tokens are being used`,
        severity: 'low',
      });
    }

    // Add score breakdown finding for transparency
    const scoreImpact: string[] = [];
    if (coverageMetrics.coveragePercentage < 50) {
      scoreImpact.push(`Low coverage (${coverageMetrics.coveragePercentage.toFixed(1)}%): -10 points`);
    }
    if (hardcodedWithMatches.length > 10) {
      scoreImpact.push(`Many hardcoded values (${hardcodedWithMatches.length}): -10 points`);
    }
    if (lowCoverageComponents.length > 10) {
      scoreImpact.push(`${lowCoverageComponents.length} low-coverage components: -5 points`);
    }

    if (scoreImpact.length > 0) {
      findings.push({
        id: 'token-score-breakdown',
        type: 'info',
        message: `Score impact factors: ${scoreImpact.join(', ')}`,
        severity: 'low',
        suggestion: 'To improve your token score: (1) Replace hardcoded values with token references, (2) Remove unused tokens or use them in components, (3) Ensure component styles use CSS variables instead of literal values.',
      });
    }
  }

  private calculateScore(tokens: TokenInfo[], findings: Finding[], filesScanned: number, coverageReport?: TokenCoverageReport): number {
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

    // Apply coverage-based scoring if coverage report is available
    if (coverageReport) {
      const { coverageMetrics } = coverageReport;
      
      // Deduct points based on coverage percentage
      if (coverageMetrics.coveragePercentage < 30) {
        score -= 20;
      } else if (coverageMetrics.coveragePercentage < 50) {
        score -= 10;
      } else if (coverageMetrics.coveragePercentage < 70) {
        score -= 5;
      }
      
      // Bonus for high coverage
      if (coverageMetrics.coveragePercentage > 80) {
        score += 10;
      }
      
      // Deduct for redundant tokens
      if (coverageReport.redundancies.length > 5) {
        score -= 5;
      }
      
      // Deduct for many hardcoded values that match tokens
      const hardcodedWithMatches = coverageReport.hardcodedValues.filter(hv => hv.matchedToken).length;
      if (hardcodedWithMatches > 10) {
        score -= 10;
      } else if (hardcodedWithMatches > 5) {
        score -= 5;
      }
    }

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