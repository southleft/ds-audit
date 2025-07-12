import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, CategoryResult, Finding, ComponentInfo } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

export class ComponentAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const components: ComponentInfo[] = [];
    
    // Find component files
    const componentPatterns = [
      '**/components/**/*.{tsx,jsx}',
      '**/src/components/**/*.{tsx,jsx}',
      '**/lib/components/**/*.{tsx,jsx}',
    ];

    const files = await this.scanner.scanFiles(componentPatterns);
    const filesScanned = files.length;

    for (const file of files) {
      const componentInfo = await this.analyzeComponent(file.path);
      if (componentInfo) {
        components.push(componentInfo);
        
        // Generate findings based on component analysis
        this.generateFindings(componentInfo, findings);
      }
    }

    // Analyze findings
    const score = this.calculateScore(components, findings);
    const grade = this.getGrade(score);

    return {
      id: 'components',
      name: 'Component Library',
      score,
      grade,
      weight: 0.25,
      findings,
      metrics: {
        totalComponents: components.length,
        filesScanned,
        componentTypes: this.categorizeComponents(components),
        testCoverage: this.calculateTestCoverage(components),
        accessibilityScore: this.calculateAccessibilityScore(components),
      },
    };
  }

  private async analyzeComponent(filePath: string): Promise<ComponentInfo | null> {
    try {
      const content = await fs.readFile(
        path.join(this.config.projectPath, filePath),
        'utf-8'
      );

      const name = path.basename(filePath, path.extname(filePath));
      const hasTests = await this.checkForTests(filePath);
      const hasStory = await this.checkForStory(filePath);
      const hasTypes = content.includes('interface') || content.includes('type');
      
      return {
        name,
        path: filePath,
        type: this.detectComponentType(name, content),
        hasTests,
        hasStory,
        hasDocumentation: false, // TODO: Implement doc detection
        hasTypes,
        accessibility: this.analyzeAccessibility(content),
        props: [], // TODO: Implement prop extraction
      };
    } catch (error) {
      return null;
    }
  }

  private detectComponentType(name: string, content: string): ComponentInfo['type'] {
    // Simple heuristic based on name and content
    if (name.toLowerCase().includes('button') || name.toLowerCase().includes('input')) {
      return 'atomic';
    }
    if (name.toLowerCase().includes('form') || name.toLowerCase().includes('card')) {
      return 'molecular';
    }
    if (name.toLowerCase().includes('page') || name.toLowerCase().includes('layout')) {
      return 'template';
    }
    return 'unknown';
  }

  private async checkForTests(componentPath: string): Promise<boolean> {
    const testPatterns = [
      componentPath.replace(/\.(tsx?|jsx?)$/, '.test.$1'),
      componentPath.replace(/\.(tsx?|jsx?)$/, '.spec.$1'),
      componentPath.replace(/\.(tsx?|jsx?)$/, '.test.ts'),
      componentPath.replace(/\.(tsx?|jsx?)$/, '.spec.ts'),
    ];

    for (const pattern of testPatterns) {
      try {
        await fs.access(path.join(this.config.projectPath, pattern));
        return true;
      } catch {
        // File doesn't exist
      }
    }
    return false;
  }

  private async checkForStory(componentPath: string): Promise<boolean> {
    const storyPatterns = [
      componentPath.replace(/\.(tsx?|jsx?)$/, '.stories.$1'),
      componentPath.replace(/\.(tsx?|jsx?)$/, '.story.$1'),
    ];

    for (const pattern of storyPatterns) {
      try {
        await fs.access(path.join(this.config.projectPath, pattern));
        return true;
      } catch {
        // File doesn't exist
      }
    }
    return false;
  }

  private analyzeAccessibility(content: string): ComponentInfo['accessibility'] {
    return {
      hasAriaLabels: content.includes('aria-'),
      hasFocusManagement: content.includes('focus') || content.includes('onFocus'),
      hasKeyboardSupport: content.includes('onKey') || content.includes('keyboard'),
      violations: [],
    };
  }

  private calculateScore(components: ComponentInfo[], findings: Finding[]): number {
    if (components.length === 0) return 0;

    let score = 100;
    
    // Deduct points for missing tests
    const withoutTests = components.filter(c => !c.hasTests).length;
    score -= (withoutTests / components.length) * 20;

    // Deduct points for missing stories
    const withoutStories = components.filter(c => !c.hasStory).length;
    score -= (withoutStories / components.length) * 15;

    // Deduct points for missing types
    const withoutTypes = components.filter(c => !c.hasTypes).length;
    score -= (withoutTypes / components.length) * 10;

    // Deduct points for accessibility issues
    const withA11yIssues = components.filter(
      c => !c.accessibility.hasAriaLabels || !c.accessibility.hasKeyboardSupport
    ).length;
    score -= (withA11yIssues / components.length) * 15;

    return Math.max(0, Math.round(score));
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private categorizeComponents(components: ComponentInfo[]): Record<string, number> {
    const categories: Record<string, number> = {
      atomic: 0,
      molecular: 0,
      organism: 0,
      template: 0,
      unknown: 0,
    };

    components.forEach(component => {
      categories[component.type]++;
    });

    return categories;
  }

  private calculateTestCoverage(components: ComponentInfo[]): number {
    if (components.length === 0) return 0;
    const withTests = components.filter(c => c.hasTests).length;
    return Math.round((withTests / components.length) * 100);
  }

  private calculateAccessibilityScore(components: ComponentInfo[]): number {
    if (components.length === 0) return 0;
    
    const scores = components.map(c => {
      let score = 0;
      if (c.accessibility.hasAriaLabels) score += 33;
      if (c.accessibility.hasFocusManagement) score += 33;
      if (c.accessibility.hasKeyboardSupport) score += 34;
      return score;
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / components.length);
  }

  private generateFindings(component: ComponentInfo, findings: Finding[]): void {
    const findingId = `comp-${component.name}-${findings.length + 1}`;

    // Check for missing tests
    if (!component.hasTests) {
      findings.push({
        id: `${findingId}-test`,
        type: 'warning',
        message: `Component '${component.name}' is missing test coverage`,
        severity: 'medium',
        path: component.path,
        suggestion: 'Add unit tests to ensure component behavior is verified',
      });
    }

    // Check for missing Storybook stories
    if (!component.hasStory) {
      findings.push({
        id: `${findingId}-story`,
        type: 'warning',
        message: `Component '${component.name}' lacks Storybook documentation`,
        severity: 'low',
        path: component.path,
        suggestion: 'Create a Storybook story to document component usage and variations',
      });
    }

    // Check for missing TypeScript types
    if (!component.hasTypes) {
      findings.push({
        id: `${findingId}-types`,
        type: 'warning',
        message: `Component '${component.name}' lacks proper TypeScript definitions`,
        severity: 'medium',
        path: component.path,
        suggestion: 'Add TypeScript interfaces or types for props and state',
      });
    }

    // Check accessibility issues
    if (!component.accessibility.hasAriaLabels) {
      findings.push({
        id: `${findingId}-aria`,
        type: 'error',
        message: `Component '${component.name}' missing ARIA labels for accessibility`,
        severity: 'high',
        path: component.path,
        suggestion: 'Add appropriate ARIA labels for screen reader support',
      });
    }

    if (!component.accessibility.hasKeyboardSupport && 
        (component.type === 'atomic' || component.name.toLowerCase().includes('button'))) {
      findings.push({
        id: `${findingId}-keyboard`,
        type: 'error',
        message: `Interactive component '${component.name}' lacks keyboard support`,
        severity: 'high',
        path: component.path,
        suggestion: 'Implement keyboard event handlers for accessibility',
      });
    }

    // Add success findings for well-implemented components
    if (component.hasTests && component.hasStory && component.hasTypes && 
        component.accessibility.hasAriaLabels) {
      findings.push({
        id: `${findingId}-success`,
        type: 'success',
        message: `Component '${component.name}' follows best practices`,
        severity: 'low',
        path: component.path,
      });
    }
  }
}