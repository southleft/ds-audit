import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, AuditResult } from '../types/index.js';

export class ReportGenerator {
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
  }

  async generate(results: AuditResult): Promise<void> {
    const outputDir = path.join(this.config.projectPath, this.config.outputPath);
    
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Generate JSON report
    await this.generateJSON(results, outputDir);

    // Generate Markdown report
    await this.generateMarkdown(results, outputDir);

    // Update results with output path
    results.metadata.outputPath = outputDir;
  }

  private async generateJSON(results: AuditResult, outputDir: string): Promise<void> {
    const jsonPath = path.join(outputDir, 'results.json');
    await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));
  }

  private async generateMarkdown(results: AuditResult, outputDir: string): Promise<void> {
    const mdPath = path.join(outputDir, 'report.md');
    
    let content = `# Design System Audit Report\n\n`;
    content += `Generated: ${new Date(results.timestamp).toLocaleString()}\n\n`;
    content += `## Overall Score: ${results.overallScore}/100 (${results.overallGrade})\n\n`;

    // External Design System Notice
    if (results.externalDesignSystem?.detected) {
      const eds = results.externalDesignSystem;
      const systemNames = eds.systems.map(s => s.name).join(', ');

      content += `## External Design System Detected\n\n`;
      content += `**Systems**: ${systemNames}\n\n`;
      content += `**Mode**: ${eds.mode === 'pure-external' ? 'Pure External (using NPM components)' : eds.mode === 'hybrid' ? 'Hybrid (external + local components)' : 'Local'}\n\n`;

      if (eds.mode === 'pure-external' || eds.mode === 'hybrid') {
        content += `> **Note**: This project uses an external design system. `;
        content += `Scoring has been adjusted to emphasize theming, token customization, and documentation rather than local component implementation.\n\n`;
        content += `- External components available: ~${eds.externalComponentCount}\n`;
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
    }

    // Category scores
    content += `## Category Scores\n\n`;
    results.categories.forEach(category => {
      content += `### ${category.name}: ${category.score}/100 (${category.grade})\n\n`;
      
      // Key findings
      const errors = category.findings.filter(f => f.type === 'error');
      const warnings = category.findings.filter(f => f.type === 'warning');
      const successes = category.findings.filter(f => f.type === 'success');
      
      if (successes.length > 0) {
        content += `**What's working ✅**\n`;
        successes.forEach(f => content += `- ${f.message}\n`);
        content += `\n`;
      }
      
      if (warnings.length > 0) {
        content += `**What needs improvement ⚠️**\n`;
        warnings.forEach(f => content += `- ${f.message}\n`);
        content += `\n`;
      }
      
      if (errors.length > 0) {
        content += `**Critical issues ❌**\n`;
        errors.forEach(f => content += `- ${f.message}\n`);
        content += `\n`;
      }
    });
    
    // Recommendations
    if (results.recommendations.length > 0) {
      content += `## Recommendations\n\n`;
      
      // Group by priority
      const highPriority = results.recommendations.filter(r => r.priority === 'high');
      const mediumPriority = results.recommendations.filter(r => r.priority === 'medium');
      const lowPriority = results.recommendations.filter(r => r.priority === 'low');
      
      if (highPriority.length > 0) {
        content += `### High Priority 🔴\n\n`;
        highPriority.forEach(r => {
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
      
      if (mediumPriority.length > 0) {
        content += `### Medium Priority 🟡\n\n`;
        mediumPriority.forEach(r => {
          content += `#### ${r.title}\n`;
          content += `${r.description}\n`;
          content += `- **Effort**: ${r.effort}\n`;
          content += `- **Impact**: ${r.impact}\n\n`;
        });
      }
      
      if (lowPriority.length > 0) {
        content += `### Low Priority 🟢\n\n`;
        lowPriority.forEach(r => {
          content += `#### ${r.title}\n`;
          content += `${r.description}\n\n`;
        });
      }
    }
    
    // Metadata
    content += `## Audit Metadata\n\n`;
    content += `- **Duration**: ${results.metadata.duration}ms\n`;
    content += `- **Files Scanned**: ${results.metadata.filesScanned}\n`;
    content += `- **Tools Detected**: ${results.metadata.toolsDetected.join(', ') || 'None'}\n`;
    content += `- **Frameworks Detected**: ${results.metadata.frameworksDetected.join(', ') || 'None'}\n`;
    
    await fs.writeFile(mdPath, content);
  }
}