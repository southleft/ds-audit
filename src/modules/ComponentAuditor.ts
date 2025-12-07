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
    const detailedPaths: any[] = [];
    const allScannedPaths = new Set<string>();
    
    // Find component files - expanded patterns for real-world design systems
    // We'll filter out stories, tests, and index files manually since glob negation is not reliable
    const componentPatterns = [
      // Standard component directories
      'src/components/**/*.{tsx,jsx,ts,js}',
      'components/**/*.{tsx,jsx,ts,js}',
      'lib/components/**/*.{tsx,jsx,ts,js}',
      'lib/**/*.{tsx,jsx}',
      // Monorepo patterns
      'packages/*/src/components/**/*.{tsx,jsx,ts,js}',
      'packages/*/components/**/*.{tsx,jsx,ts,js}',
      'packages/*/lib/components/**/*.{tsx,jsx,ts,js}',
      'packages/*/src/**/*.{tsx,jsx}',
      // Storybook-based design systems (common pattern)
      'src/stories/**/*.{tsx,jsx}',
      'stories/**/*.{tsx,jsx}',
      // Generic source patterns (will filter out tests/stories)
      'src/**/*.{tsx,jsx}',
      // UI library patterns
      'src/ui/**/*.{tsx,jsx,ts,js}',
      'ui/**/*.{tsx,jsx,ts,js}',
      // Feature-based patterns
      'src/features/**/components/**/*.{tsx,jsx}',
      'app/components/**/*.{tsx,jsx}',
      'app/**/components/**/*.{tsx,jsx}',
    ];
    
    // Also scan for styles
    const stylePatterns = [
      '**/components/**/*.{css,scss,sass,less,styl}',
      '**/src/components/**/*.{css,scss,sass,less,styl}',
      '**/packages/*/components/**/*.{css,scss,sass,less,styl}',
      '**/styles/**/*.{css,scss,sass,less,styl}',
    ];
    
    // Scan for test files
    const testPatterns = [
      '**/components/**/*.{test,spec}.{ts,tsx,js,jsx}',
      '**/__tests__/**/*.{ts,tsx,js,jsx}',
      '**/packages/*/components/**/*.{test,spec}.{ts,tsx,js,jsx}',
    ];
    
    // Scan for stories - expanded patterns
    const storyPatterns = [
      '**/components/**/*.stories.{ts,tsx,js,jsx,mdx}',
      '**/packages/*/components/**/*.stories.{ts,tsx,js,jsx,mdx}',
      'src/stories/**/*.stories.{ts,tsx,js,jsx,mdx}',
      'stories/**/*.stories.{ts,tsx,js,jsx,mdx}',
      'src/**/*.stories.{ts,tsx,js,jsx,mdx}',
      '**/*.stories.{ts,tsx,js,jsx,mdx}',
    ];

    // Process each pattern group
    const allPatterns = {
      'Component Files': componentPatterns,
      'Style Files': stylePatterns,
      'Test Files': testPatterns,
      'Story Files': storyPatterns,
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
          
          // Track file types
          const ext = file.extension.toLowerCase();
          patternResults.fileTypes[ext] = (patternResults.fileTypes[ext] || 0) + 1;
          
          // Only analyze actual component files (double-check to exclude stories/tests/demos)
          if (category === 'Component Files') {
            const fileName = path.basename(file.path);
            const fileNameLower = fileName.toLowerCase();
            const fileNameWithoutExt = path.basename(file.path, path.extname(file.path));

            // Check if this is a story, test, demo, or index file
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

            // Skip non-component files
            if (!isStoryFile && !isTestFile && !isDemoFile && !isIndexFile && !isUtilityFile) {
              const componentInfo = await this.analyzeComponent(file.path);
              if (componentInfo) {
                // Check for duplicates before adding
                const isDuplicate = components.some(c => c.name === componentInfo.name && c.path === componentInfo.path);
                if (!isDuplicate) {
                  components.push(componentInfo);
                  this.generateFindings(componentInfo, findings);
                }
              }
            } else {
              // Log what we're skipping for debugging
              console.log(`[ComponentAuditor] Skipping non-component file: ${fileName} (story: ${isStoryFile}, test: ${isTestFile}, demo: ${isDemoFile}, index: ${isIndexFile}, utility: ${isUtilityFile})`);
            }
          }
        }
      }
      
      if (patternResults.matches.length > 0) {
        detailedPaths.push(patternResults);
      }
    }

    const filesScanned = totalFilesScanned;

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
      scannedPaths: Array.from(allScannedPaths).sort(),
      detailedPaths,
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
        hasDocumentation: false,
        hasTypes,
        accessibility: this.analyzeAccessibility(content),
        props: [],
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