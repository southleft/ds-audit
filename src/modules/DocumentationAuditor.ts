import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, CategoryResult, Finding, DocumentationInfo } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

export class DocumentationAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const documentation: DocumentationInfo[] = [];
    
    // Check for main documentation files
    const mainDocs = await this.checkMainDocumentation(findings);
    documentation.push(...mainDocs);

    // Scan for component documentation
    const componentDocs = await this.scanComponentDocumentation();
    documentation.push(...componentDocs);

    // Scan for general documentation
    const generalDocs = await this.scanGeneralDocumentation();
    documentation.push(...generalDocs);

    // Check documentation quality
    this.analyzeDocumentationQuality(documentation, findings);

    // Calculate score
    const score = this.calculateScore(documentation, findings);
    const grade = this.getGrade(score);

    return {
      id: 'documentation',
      name: 'Documentation',
      score,
      grade,
      weight: 0.15,
      findings,
      metrics: {
        filesScanned: documentation.length,
        totalDocs: documentation.length,
        docTypes: this.categorizeDocumentation(documentation),
        averageCompleteness: this.calculateAverageCompleteness(documentation),
        missingDocs: findings.filter(f => f.id.includes('missing')).length,
      },
    };
  }

  private async checkMainDocumentation(findings: Finding[]): Promise<DocumentationInfo[]> {
    const docs: DocumentationInfo[] = [];
    const essentialDocs = [
      { file: 'README.md', type: 'system' as const, title: 'Project README' },
      { file: 'CONTRIBUTING.md', type: 'guide' as const, title: 'Contributing Guide' },
      { file: 'CHANGELOG.md', type: 'guide' as const, title: 'Change Log' },
      { file: 'docs/README.md', type: 'system' as const, title: 'Documentation Index' },
      { file: 'API.md', type: 'api' as const, title: 'API Documentation' },
    ];

    for (const { file, type, title } of essentialDocs) {
      const exists = await this.scanner.fileExists(file);
      
      if (exists) {
        const content = await this.scanner.readFile(file);
        const completeness = this.assessDocumentCompleteness(content, type);
        
        docs.push({
          type,
          path: file,
          title,
          completeness,
          missingElements: this.findMissingElements(content, type),
        });

        if (completeness >= 80) {
          findings.push({
            id: `doc-${file}-good`,
            type: 'success',
            message: `${title} is well documented`,
            severity: 'low',
            path: file,
          });
        } else if (completeness < 50) {
          findings.push({
            id: `doc-${file}-incomplete`,
            type: 'warning',
            message: `${title} is incomplete (${completeness}% complete)`,
            severity: 'medium',
            path: file,
            suggestion: `Add missing sections: ${this.findMissingElements(content, type).join(', ')}`,
          });
        }
      } else {
        findings.push({
          id: `doc-${file}-missing`,
          type: 'error',
          message: `Essential documentation missing: ${title}`,
          severity: file === 'README.md' ? 'high' : 'medium',
          suggestion: `Create ${file} to document your design system`,
        });
      }
    }

    return docs;
  }

  private async scanComponentDocumentation(): Promise<DocumentationInfo[]> {
    const docs: DocumentationInfo[] = [];
    
    // Look for component documentation (including Storybook stories)
    const patterns = [
      '**/components/**/*.{md,mdx}',
      '**/src/components/**/*.{md,mdx}',
      '**/*.stories.{js,jsx,ts,tsx,mdx}',
      '**/*.story.{js,jsx,ts,tsx,mdx}',
      '**/stories/**/*.{js,jsx,ts,tsx,mdx}',
    ];

    const files = await this.scanner.scanFiles(patterns);
    
    for (const file of files) {
      const content = await this.scanner.readFile(file.path);
      const completeness = this.assessDocumentCompleteness(content, 'component');
      
      docs.push({
        type: 'component',
        path: file.path,
        title: path.basename(file.path, path.extname(file.path)),
        completeness,
        missingElements: this.findMissingElements(content, 'component'),
      });
    }

    return docs;
  }

  private async scanGeneralDocumentation(): Promise<DocumentationInfo[]> {
    const docs: DocumentationInfo[] = [];
    
    // Look for documentation directories
    const patterns = [
      'docs/**/*.{md,mdx}',
      'documentation/**/*.{md,mdx}',
      '*.md',
      '!node_modules/**',
    ];

    const files = await this.scanner.scanFiles(patterns);
    
    for (const file of files) {
      // Skip if already processed
      if (docs.some(d => d.path === file.path)) continue;
      
      const content = await this.scanner.readFile(file.path);
      const type = this.detectDocumentationType(file.path, content);
      const completeness = this.assessDocumentCompleteness(content, type);
      
      docs.push({
        type,
        path: file.path,
        title: this.extractTitle(content) || path.basename(file.path, '.md'),
        completeness,
        missingElements: this.findMissingElements(content, type),
      });
    }

    return docs;
  }

  private detectDocumentationType(filePath: string, content: string): DocumentationInfo['type'] {
    const pathLower = filePath.toLowerCase();
    const contentLower = content.toLowerCase();
    
    if (pathLower.includes('component') || contentLower.includes('props')) {
      return 'component';
    }
    if (pathLower.includes('api') || contentLower.includes('endpoint')) {
      return 'api';
    }
    if (pathLower.includes('guide') || pathLower.includes('tutorial')) {
      return 'guide';
    }
    return 'system';
  }

  private assessDocumentCompleteness(content: string, type: DocumentationInfo['type']): number {
    const elements = this.getRequiredElements(type);
    let foundElements = 0;
    
    elements.forEach(element => {
      if (content.toLowerCase().includes(element.toLowerCase())) {
        foundElements++;
      }
    });

    return Math.round((foundElements / elements.length) * 100);
  }

  private getRequiredElements(type: DocumentationInfo['type']): string[] {
    switch (type) {
      case 'component':
        return ['props', 'usage', 'example', 'import', 'accessibility'];
      case 'api':
        return ['endpoint', 'method', 'parameters', 'response', 'example'];
      case 'guide':
        return ['introduction', 'steps', 'example', 'troubleshooting'];
      case 'system':
        return ['overview', 'installation', 'usage', 'configuration', 'contributing'];
      default:
        return ['introduction', 'usage', 'example'];
    }
  }

  private findMissingElements(content: string, type: DocumentationInfo['type']): string[] {
    const required = this.getRequiredElements(type);
    const missing: string[] = [];
    
    required.forEach(element => {
      if (!content.toLowerCase().includes(element.toLowerCase())) {
        missing.push(element);
      }
    });

    return missing;
  }

  private extractTitle(content: string): string | null {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  private analyzeDocumentationQuality(docs: DocumentationInfo[], findings: Finding[]): void {
    // Check for Storybook
    const hasStorybook = docs.some(d => d.path.includes('.stories.'));
    if (hasStorybook) {
      findings.push({
        id: 'doc-storybook',
        type: 'success',
        message: 'Storybook documentation found',
        severity: 'low',
      });
    } else {
      findings.push({
        id: 'doc-no-storybook',
        type: 'info',
        message: 'Consider using Storybook for interactive component documentation',
        severity: 'low',
        suggestion: 'Install and configure Storybook to showcase components',
      });
    }

    // Check component documentation coverage
    const componentDocs = docs.filter(d => d.type === 'component');
    if (componentDocs.length === 0) {
      findings.push({
        id: 'doc-no-component-docs',
        type: 'warning',
        message: 'No component documentation found',
        severity: 'high',
        suggestion: 'Document each component with props, usage examples, and guidelines',
      });
    }

    // Check for docs folder
    const hasDocsFolder = docs.some(d => d.path.startsWith('docs/'));
    if (!hasDocsFolder && docs.length < 5) {
      findings.push({
        id: 'doc-no-docs-folder',
        type: 'info',
        message: 'Consider creating a dedicated docs folder',
        severity: 'low',
        suggestion: 'Organize documentation in a /docs directory',
      });
    }

    // Check overall documentation coverage
    const avgCompleteness = this.calculateAverageCompleteness(docs);
    if (avgCompleteness >= 80) {
      findings.push({
        id: 'doc-high-quality',
        type: 'success',
        message: `High documentation quality (${avgCompleteness}% average completeness)`,
        severity: 'low',
      });
    }
  }

  private categorizeDocumentation(docs: DocumentationInfo[]): Record<string, number> {
    const categories: Record<string, number> = {
      component: 0,
      system: 0,
      api: 0,
      guide: 0,
    };

    docs.forEach(doc => {
      categories[doc.type]++;
    });

    return categories;
  }

  private calculateAverageCompleteness(docs: DocumentationInfo[]): number {
    if (docs.length === 0) return 0;
    
    const total = docs.reduce((sum, doc) => sum + doc.completeness, 0);
    return Math.round(total / docs.length);
  }

  private calculateScore(docs: DocumentationInfo[], findings: Finding[]): number {
    let score = 100;

    // Major deductions
    const missingEssential = findings.filter(f => 
      f.id.includes('missing') && f.severity === 'high'
    ).length;
    score -= missingEssential * 20;

    // No documentation at all
    if (docs.length === 0) {
      return 0;
    }

    // Deduct for low completeness
    const avgCompleteness = this.calculateAverageCompleteness(docs);
    if (avgCompleteness < 50) {
      score -= 30;
    } else if (avgCompleteness < 70) {
      score -= 15;
    }

    // Deduct for missing component docs
    const componentDocs = docs.filter(d => d.type === 'component');
    if (componentDocs.length === 0) {
      score -= 20;
    }

    // Deduct for warnings
    const warnings = findings.filter(f => f.type === 'warning').length;
    score -= warnings * 5;

    // Bonus for good practices
    const hasStorybook = docs.some(d => d.path.includes('.stories.'));
    if (hasStorybook) score += 10;

    const hasDocsFolder = docs.some(d => d.path.startsWith('docs/'));
    if (hasDocsFolder) score += 5;

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