import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

export class GovernanceAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    
    // Check for governance files
    const governanceFiles = [
      { file: 'CONTRIBUTING.md', name: 'Contributing Guidelines' },
      { file: 'CODE_OF_CONDUCT.md', name: 'Code of Conduct' },
      { file: 'GOVERNANCE.md', name: 'Governance Model' },
      { file: '.github/PULL_REQUEST_TEMPLATE.md', name: 'PR Template' },
      { file: '.github/ISSUE_TEMPLATE', name: 'Issue Templates' },
    ];

    let foundFiles = 0;
    
    for (const { file, name } of governanceFiles) {
      const exists = await this.scanner.fileExists(file);
      if (exists) {
        foundFiles++;
        findings.push({
          id: `gov-${file}`,
          type: 'success',
          message: `${name} found`,
          severity: 'low',
        });
      } else {
        findings.push({
          id: `gov-${file}-missing`,
          type: 'warning',
          message: `${name} missing`,
          severity: 'medium',
          suggestion: `Create ${file} to establish clear contribution guidelines`,
        });
      }
    }

    // Check for versioning strategy
    const hasVersioning = await this.checkVersioningStrategy();
    if (hasVersioning) {
      findings.push({
        id: 'gov-versioning',
        type: 'success',
        message: 'Versioning strategy detected',
        severity: 'low',
      });
    }

    const score = this.calculateScore(foundFiles, governanceFiles.length);

    return {
      id: 'governance',
      name: 'Governance',
      score,
      grade: this.getGrade(score),
      weight: 0.10,
      findings,
      metrics: {
        filesScanned: governanceFiles.length,
        governanceFiles: foundFiles,
        hasVersioning,
      },
    };
  }

  private async checkVersioningStrategy(): Promise<boolean> {
    try {
      const packageJson = await this.scanner.readFile('package.json');
      const pkg = JSON.parse(packageJson);
      return !!pkg.version;
    } catch {
      return false;
    }
  }

  private calculateScore(found: number, total: number): number {
    const baseScore = (found / total) * 100;
    return Math.round(baseScore);
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}