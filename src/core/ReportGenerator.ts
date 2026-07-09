import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, AuditResult, Finding } from '../types/index.js';

export type ReportFormat = 'json' | 'md';

export class ReportGenerator {
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
  }

  async generate(results: AuditResult, formats: ReportFormat[] = ['json', 'md']): Promise<void> {
    const outputDir = path.join(this.config.projectPath, this.config.outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Set before serialization so results.json carries the output path too.
    results.metadata.outputPath = outputDir;

    if (formats.includes('json')) {
      await this.generateJSON(results, outputDir);
    }
    if (formats.includes('md')) {
      await this.generateMarkdown(results, outputDir);
    }
  }

  private async generateJSON(results: AuditResult, outputDir: string): Promise<void> {
    const jsonPath = path.join(outputDir, 'results.json');
    await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));
  }

  private async generateMarkdown(results: AuditResult, outputDir: string): Promise<void> {
    const mdPath = path.join(outputDir, 'report.md');

    let content = `# Design System Audit Report\n\n`;
    content += `Generated: ${new Date(results.timestamp).toLocaleString()}\n\n`;
    content += `## Overall Score: ${results.overallScore}/100 (${results.overallGrade})`;
    content += results.partial ? ` — PARTIAL\n\n` : `\n\n`;

    // A partial audit must be impossible to miss.
    if (results.partial && results.metadata.failedCategories?.length) {
      content += `> ⚠️ **This audit is incomplete.** The following categories failed to run and are `;
      content += `NOT included in the overall score:\n>\n`;
      for (const failed of results.metadata.failedCategories) {
        content += `> - **${failed.id}**: ${failed.error}\n`;
      }
      content += `\n`;
    }

    content += this.renderExternalDS(results);
    content += this.renderCategories(results);
    content += this.renderAIInsights(results);
    content += this.renderRecommendations(results);
    content += this.renderMetadata(results);

    await fs.writeFile(mdPath, content);
  }

  private renderExternalDS(results: AuditResult): string {
    if (!results.externalDesignSystem?.detected) return '';
    const eds = results.externalDesignSystem;
    const systemNames = eds.systems.map(s => s.name).join(', ');

    let content = `## External Design System Detected\n\n`;
    content += `**Systems**: ${systemNames}\n\n`;
    content += `**Mode**: ${
      eds.mode === 'pure-external'
        ? 'Pure External (using NPM components)'
        : eds.mode === 'hybrid'
          ? 'Hybrid (external + local components)'
          : 'Local'
    }\n\n`;

    if (eds.mode === 'pure-external' || eds.mode === 'hybrid') {
      content += `> **Note**: This project uses an external design system. `;
      content += `Scoring has been adjusted to emphasize theming, token customization, and documentation rather than local component implementation.\n\n`;
      content += `- Local components: ${eds.localComponentCount}\n`;
      content += `- Scoring adjustment: Component weight ${(eds.scoringAdjustment.componentWeight * 100).toFixed(0)}%, Token weight ${(eds.scoringAdjustment.tokenWeight * 100).toFixed(0)}%\n\n`;
    }

    if (eds.themeCustomizations.length > 0) {
      content += `### Theme Customizations\n\n`;
      eds.themeCustomizations.forEach(tc => {
        content += `- **${tc.file}**: ${tc.description}\n`;
      });
      content += `\n`;
    }

    content += `### External System Details\n\n`;
    eds.systems.forEach(sys => {
      content += `- **${sys.name}** (${sys.packageName}${sys.version ? `@${sys.version}` : ''})\n`;
      content += `  - Type: ${sys.type}\n`;
      content += `  - Theme Support: ${sys.hasThemeSupport ? 'Yes' : 'No'}\n`;
      content += `  - Documentation: ${sys.documentation}\n`;
    });
    content += `\n`;
    return content;
  }

  private renderCategories(results: AuditResult): string {
    let content = `## Category Scores\n\n`;

    results.categories.forEach(category => {
      content += `### ${category.name}: ${category.score}/100 (${category.grade})`;
      content += ` — weight ${(category.weight * 100).toFixed(0)}%\n\n`;

      if (category.judge && category.deterministicScore !== undefined) {
        content += `*Blended score: static analysis ${category.deterministicScore}/100 + `;
        content += `AI judge ${category.judge.score}/100 (${category.judge.confidence} confidence, ${category.judge.model})*\n\n`;
      }

      // Buckets keyed on severity — the same field scoring uses — so the
      // report's framing matches the score's framing.
      const critical = category.findings.filter(f => f.severity === 'critical');
      const high = category.findings.filter(f => f.severity === 'high');
      const successes = category.findings.filter(f => f.type === 'success');
      const other = category.findings.filter(
        f => f.type !== 'success' && f.severity !== 'critical' && f.severity !== 'high'
      );

      if (successes.length > 0) {
        content += `**What's working ✅**\n`;
        successes.forEach(f => (content += `- ${this.renderFinding(f)}\n`));
        content += `\n`;
      }
      if (critical.length > 0) {
        content += `**Critical issues ❌**\n`;
        critical.forEach(f => (content += `- ${this.renderFinding(f)}\n`));
        content += `\n`;
      }
      if (high.length > 0) {
        content += `**High-severity issues 🔴**\n`;
        high.forEach(f => (content += `- ${this.renderFinding(f)}\n`));
        content += `\n`;
      }
      if (other.length > 0) {
        content += `**Other findings ⚠️**\n`;
        other.forEach(f => (content += `- ${this.renderFinding(f)}\n`));
        content += `\n`;
      }

      if (category.judge) {
        content += `**AI judge assessment** (${category.judge.confidence} confidence)\n\n`;
        content += `${category.judge.summary}\n\n`;
        if (category.judge.strengths.length > 0) {
          content += `Strengths noted by the judge:\n`;
          category.judge.strengths.forEach(s => (content += `- ${s}\n`));
          content += `\n`;
        }
      }
    });

    return content;
  }

  private renderFinding(finding: Finding): string {
    const origin = finding.id.startsWith('judge-') ? ' *(AI judge)*' : '';
    const location = finding.path ? ` — \`${finding.path}\`` : '';
    return `${finding.message}${location}${origin}`;
  }

  private renderAIInsights(results: AuditResult): string {
    if (!results.aiInsights) return '';
    let content = `## AI Insights\n\n`;
    content += `${results.aiInsights.summary}\n\n`;
    if (results.aiInsights.strengths.length > 0) {
      content += `**Strengths**\n`;
      results.aiInsights.strengths.forEach(s => (content += `- ${s}\n`));
      content += `\n`;
    }
    if (results.aiInsights.improvements.length > 0) {
      content += `**Improvement areas**\n`;
      results.aiInsights.improvements.forEach(s => (content += `- ${s}\n`));
      content += `\n`;
    }
    return content;
  }

  private renderRecommendations(results: AuditResult): string {
    if (results.recommendations.length === 0) return '';
    let content = `## Recommendations\n\n`;

    const byPriority: Array<{ label: string; items: typeof results.recommendations }> = [
      { label: '### High Priority 🔴', items: results.recommendations.filter(r => r.priority === 'high') },
      { label: '### Medium Priority 🟡', items: results.recommendations.filter(r => r.priority === 'medium') },
      { label: '### Low Priority 🟢', items: results.recommendations.filter(r => r.priority === 'low') },
    ];

    for (const group of byPriority) {
      if (group.items.length === 0) continue;
      content += `${group.label}\n\n`;
      group.items.forEach(r => {
        content += `#### ${r.title}\n`;
        content += `${r.description}\n`;
        content += `- **Effort**: ${r.effort}\n`;
        content += `- **Impact**: ${r.impact}\n`;
        if (r.implementation) {
          content += `- **Implementation**: ${r.implementation}\n`;
        }
        content += `\n`;
      });
    }
    return content;
  }

  private renderMetadata(results: AuditResult): string {
    let content = `## Audit Metadata\n\n`;
    content += `- **Duration**: ${results.metadata.duration}ms\n`;
    content += `- **Files Scanned**: ${results.metadata.filesScanned}\n`;
    content += `- **Tools Detected**: ${results.metadata.toolsDetected.join(', ') || 'None'}\n`;
    content += `- **Frameworks Detected**: ${results.metadata.frameworksDetected.join(', ') || 'None'}\n`;
    if (results.metadata.errors.length > 0) {
      content += `- **Errors during audit**:\n`;
      results.metadata.errors.forEach(e => (content += `  - ${e}\n`));
    }
    return content;
  }
}
