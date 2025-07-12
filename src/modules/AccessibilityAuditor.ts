import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

export class AccessibilityAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const metrics: Record<string, any> = {
      filesScanned: 0,
      componentsWithA11y: 0,
      totalComponents: 0,
      ariaUsage: 0,
      semanticHTML: 0,
      colorContrastIssues: 0,
    };

    // Scan component files
    const componentFiles = await this.scanner.scanFiles([
      '**/*.{tsx,jsx}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
    ]);
    
    metrics.filesScanned = componentFiles.length;
    metrics.totalComponents = componentFiles.length;

    // Analyze each component
    for (const file of componentFiles) {
      await this.analyzeComponentAccessibility(file.path, findings, metrics);
    }

    // Check for accessibility testing
    await this.checkA11yTesting(findings);

    // Check for semantic HTML usage
    await this.checkSemanticHTML(findings, metrics);

    // Check for focus management
    await this.checkFocusManagement(findings);

    // Check for color contrast (basic check)
    await this.checkColorContrast(findings, metrics);

    // Generate overall findings
    this.generateOverallFindings(findings, metrics);

    const score = this.calculateScore(findings, metrics);

    return {
      id: 'accessibility',
      name: 'Accessibility',
      score,
      grade: this.getGrade(score),
      weight: 0.10,
      findings,
      metrics,
    };
  }

  private async analyzeComponentAccessibility(
    filePath: string,
    findings: Finding[],
    metrics: any
  ): Promise<void> {
    try {
      const content = await this.scanner.readFile(filePath);
      
      // Check for ARIA attributes
      const ariaMatches = content.match(/aria-[a-z]+/g) || [];
      if (ariaMatches.length > 0) {
        metrics.ariaUsage++;
        metrics.componentsWithA11y++;
      }

      // Check for common accessibility patterns
      const a11yPatterns = {
        hasAltText: /alt\s*=/,
        hasAriaLabel: /aria-label\s*=/,
        hasAriaLabelledBy: /aria-labelledby\s*=/,
        hasRole: /role\s*=/,
        hasTabIndex: /tabIndex\s*=/,
        hasSrOnly: /sr-only|visually-hidden|screen-reader/,
      };

      let hasA11yFeatures = false;
      for (const [feature, pattern] of Object.entries(a11yPatterns)) {
        if (pattern.test(content)) {
          hasA11yFeatures = true;
          break;
        }
      }

      // Check for keyboard event handlers
      const hasKeyboardHandlers = /onKey(Down|Up|Press)/.test(content);
      if (hasKeyboardHandlers) {
        metrics.componentsWithA11y++;
      }

      // Check for focus trap pattern
      const hasFocusTrap = /focus.*trap|FocusTrap|useFocusTrap/.test(content);
      if (hasFocusTrap) {
        findings.push({
          id: `a11y-focus-trap-${filePath}`,
          type: 'success',
          message: `Component implements focus trapping: ${filePath}`,
          severity: 'low',
        });
      }

      // Check for missing alt text on images
      const imgTags = content.match(/<img[^>]+>/g) || [];
      const imgTagsWithoutAlt = imgTags.filter(tag => !tag.includes('alt='));
      if (imgTagsWithoutAlt.length > 0) {
        findings.push({
          id: `a11y-missing-alt-${filePath}`,
          type: 'error',
          message: `Missing alt text on images in ${filePath}`,
          severity: 'high',
          path: filePath,
          suggestion: 'Add alt text to all images for screen reader users',
        });
      }

      // Check for button accessibility
      const buttonPatterns = /<button[^>]*>|<Button[^>]*>/g;
      const buttons = content.match(buttonPatterns) || [];
      const inaccessibleButtons = buttons.filter(button => {
        return !button.includes('aria-label') && 
               !button.includes('aria-labelledby') &&
               !button.includes('title');
      });
      
      if (inaccessibleButtons.length > 0 && content.includes('<Icon') && !content.includes('children')) {
        findings.push({
          id: `a11y-icon-button-${filePath}`,
          type: 'warning',
          message: `Icon-only buttons may need aria-label in ${filePath}`,
          severity: 'medium',
          path: filePath,
          suggestion: 'Add aria-label to icon-only buttons',
        });
      }
    } catch (error) {
      // Error reading file
    }
  }

  private async checkA11yTesting(findings: Finding[]): Promise<void> {
    // Check for accessibility testing tools
    try {
      const packageJson = JSON.parse(await this.scanner.readFile('package.json'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      const a11yTools = [
        'jest-axe',
        '@testing-library/jest-dom',
        'pa11y',
        'axe-core',
        'react-axe',
      ];
      
      const foundTools = a11yTools.filter(tool => deps[tool]);
      
      if (foundTools.length > 0) {
        findings.push({
          id: 'a11y-testing-tools',
          type: 'success',
          message: `Accessibility testing tools found: ${foundTools.join(', ')}`,
          severity: 'low',
        });
      } else {
        findings.push({
          id: 'a11y-no-testing',
          type: 'warning',
          message: 'No accessibility testing tools detected',
          severity: 'high',
          suggestion: 'Install jest-axe or @testing-library/jest-dom for accessibility testing',
        });
      }
    } catch (error) {
      // Error checking package.json
    }
  }

  private async checkSemanticHTML(findings: Finding[], metrics: any): Promise<void> {
    // Sample check for semantic HTML usage
    const htmlFiles = await this.scanner.scanFiles(['**/*.{html,tsx,jsx}', '!**/node_modules/**']);
    
    let semanticElements = 0;
    let nonSemanticDivs = 0;
    
    for (const file of htmlFiles.slice(0, 20)) { // Check first 20 files
      try {
        const content = await this.scanner.readFile(file.path);
        
        // Count semantic elements
        const semanticTags = ['<nav', '<main', '<header', '<footer', '<article', '<section', '<aside'];
        semanticTags.forEach(tag => {
          if (content.includes(tag)) {
            semanticElements++;
          }
        });
        
        // Count divs that might be replaceable
        const divCount = (content.match(/<div/g) || []).length;
        if (divCount > 10) {
          nonSemanticDivs++;
        }
      } catch (error) {
        // Error reading file
      }
    }
    
    metrics.semanticHTML = semanticElements;
    
    if (semanticElements > 5) {
      findings.push({
        id: 'a11y-semantic-html',
        type: 'success',
        message: 'Good use of semantic HTML elements',
        severity: 'low',
      });
    } else {
      findings.push({
        id: 'a11y-low-semantic-html',
        type: 'warning',
        message: 'Limited use of semantic HTML elements',
        severity: 'medium',
        suggestion: 'Use semantic HTML elements like <nav>, <main>, <header> instead of generic <div>',
      });
    }
  }

  private async checkFocusManagement(findings: Finding[]): Promise<void> {
    // Check for focus management patterns
    const jsFiles = await this.scanner.scanFiles(['**/*.{js,jsx,ts,tsx}', '!**/node_modules/**']);
    
    let focusManagementFound = false;
    const focusPatterns = [
      /\.focus\(\)/,
      /useFocus/,
      /focusManager/,
      /trapFocus/,
      /restoreFocus/,
    ];
    
    for (const file of jsFiles.slice(0, 30)) { // Check first 30 files
      try {
        const content = await this.scanner.readFile(file.path);
        
        for (const pattern of focusPatterns) {
          if (pattern.test(content)) {
            focusManagementFound = true;
            break;
          }
        }
        
        if (focusManagementFound) break;
      } catch (error) {
        // Error reading file
      }
    }
    
    if (focusManagementFound) {
      findings.push({
        id: 'a11y-focus-management',
        type: 'success',
        message: 'Focus management patterns detected',
        severity: 'low',
      });
    } else {
      findings.push({
        id: 'a11y-no-focus-management',
        type: 'info',
        message: 'Consider implementing focus management for modals and dynamic content',
        severity: 'low',
      });
    }
  }

  private async checkColorContrast(findings: Finding[], metrics: any): Promise<void> {
    // Basic check for color contrast considerations
    const cssFiles = await this.scanner.scanFiles(['**/*.{css,scss,sass}', '!**/node_modules/**']);
    
    let hasContrastVariables = false;
    let lowContrastWarnings = 0;
    
    for (const file of cssFiles.slice(0, 20)) { // Check first 20 files
      try {
        const content = await this.scanner.readFile(file.path);
        
        // Check for contrast-related variables or utilities
        if (content.includes('contrast') || content.includes('a11y')) {
          hasContrastVariables = true;
        }
        
        // Very basic check for potentially low contrast (light gray on white)
        const lightGrayPattern = /color:\s*(#[ef][0-9a-f]{5}|rgba?\(\s*2[0-5]\d)/i;
        if (lightGrayPattern.test(content)) {
          lowContrastWarnings++;
        }
      } catch (error) {
        // Error reading file
      }
    }
    
    metrics.colorContrastIssues = lowContrastWarnings;
    
    if (hasContrastVariables) {
      findings.push({
        id: 'a11y-contrast-utilities',
        type: 'success',
        message: 'Color contrast utilities or variables found',
        severity: 'low',
      });
    }
    
    if (lowContrastWarnings > 2) {
      findings.push({
        id: 'a11y-potential-contrast-issues',
        type: 'warning',
        message: 'Potential color contrast issues detected',
        severity: 'medium',
        suggestion: 'Ensure all text meets WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)',
      });
    }
  }

  private generateOverallFindings(findings: Finding[], metrics: any): void {
    const a11yPercentage = (metrics.componentsWithA11y / metrics.totalComponents) * 100;
    
    if (a11yPercentage > 70) {
      findings.push({
        id: 'a11y-good-coverage',
        type: 'success',
        message: `${a11yPercentage.toFixed(0)}% of components have accessibility features`,
        severity: 'low',
      });
    } else if (a11yPercentage < 30) {
      findings.push({
        id: 'a11y-low-coverage',
        type: 'error',
        message: `Only ${a11yPercentage.toFixed(0)}% of components have accessibility features`,
        severity: 'high',
        suggestion: 'Implement ARIA attributes, keyboard navigation, and screen reader support',
      });
    }

    // Check for accessibility documentation
    if (metrics.filesScanned > 0 && findings.filter(f => f.type === 'success').length > 3) {
      findings.push({
        id: 'a11y-overall-good',
        type: 'info',
        message: 'Consider documenting accessibility guidelines for your design system',
        severity: 'low',
      });
    }
  }

  private calculateScore(findings: Finding[], metrics: any): number {
    let score = 100;

    // Deduct points based on findings
    const errors = findings.filter(f => f.type === 'error').length;
    const warnings = findings.filter(f => f.type === 'warning').length;
    
    score -= errors * 15;
    score -= warnings * 7;

    // Deduct for low accessibility coverage
    const a11yPercentage = (metrics.componentsWithA11y / Math.max(metrics.totalComponents, 1)) * 100;
    if (a11yPercentage < 50) {
      score -= 20;
    } else if (a11yPercentage < 70) {
      score -= 10;
    }

    // Bonus for good practices
    const successFindings = findings.filter(f => f.type === 'success').length;
    score += successFindings * 5;

    // Bonus for semantic HTML
    if (metrics.semanticHTML > 5) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}