import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

export class ToolingAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const toolsDetected: string[] = [];
    
    // Detect project info
    const projectInfo = await this.scanner.detectProjectInfo();
    
    // Check for various tools
    const configFiles = await this.scanner.findConfigFiles();
    
    // Analyze tools
    if (configFiles.eslint) {
      toolsDetected.push('ESLint');
      findings.push({
        id: 'tool-eslint',
        type: 'success',
        message: 'ESLint configuration found',
        severity: 'low',
      });
    } else {
      findings.push({
        id: 'tool-eslint-missing',
        type: 'warning',
        message: 'No ESLint configuration found',
        severity: 'medium',
        suggestion: 'Add ESLint for code quality',
      });
    }

    if (configFiles.prettier) {
      toolsDetected.push('Prettier');
      findings.push({
        id: 'tool-prettier',
        type: 'success',
        message: 'Prettier configuration found',
        severity: 'low',
      });
    }

    if (configFiles.typescript) {
      toolsDetected.push('TypeScript');
      findings.push({
        id: 'tool-typescript',
        type: 'success',
        message: 'TypeScript configuration found',
        severity: 'low',
      });
    }

    if (projectInfo.hasStorybook) {
      toolsDetected.push('Storybook');
      findings.push({
        id: 'tool-storybook',
        type: 'success',
        message: 'Storybook detected',
        severity: 'low',
      });
    }

    if (projectInfo.hasTests) {
      toolsDetected.push('Testing Framework');
    }

    // Check for CI/CD
    const hasCI = await this.checkForCI();
    if (hasCI) {
      toolsDetected.push('CI/CD');
      findings.push({
        id: 'tool-ci',
        type: 'success',
        message: 'CI/CD configuration found',
        severity: 'low',
      });
    }

    const score = this.calculateScore(toolsDetected, findings);

    return {
      id: 'tooling',
      name: 'Tooling & Infrastructure',
      score,
      grade: this.getGrade(score),
      weight: 0.10,
      findings,
      metrics: {
        filesScanned: Object.values(configFiles).flat().length,
        toolsDetected,
        framework: projectInfo.type,
        hasTypeScript: projectInfo.hasTypeScript,
        hasStorybook: projectInfo.hasStorybook,
        hasTests: projectInfo.hasTests,
      },
    };
  }

  private async checkForCI(): Promise<boolean> {
    const ciFiles = [
      '.github/workflows',
      '.gitlab-ci.yml',
      '.circleci/config.yml',
      'bitbucket-pipelines.yml',
      '.travis.yml',
    ];

    for (const file of ciFiles) {
      if (await this.scanner.fileExists(file)) {
        return true;
      }
    }
    return false;
  }

  private calculateScore(tools: string[], findings: Finding[]): number {
    let score = 0;
    
    // Base score on tools present
    const essentialTools = ['ESLint', 'TypeScript', 'Testing Framework'];
    const importantTools = ['Prettier', 'Storybook', 'CI/CD'];
    
    essentialTools.forEach(tool => {
      if (tools.includes(tool)) score += 25;
    });
    
    importantTools.forEach(tool => {
      if (tools.includes(tool)) score += 8;
    });

    return Math.min(100, Math.round(score));
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}