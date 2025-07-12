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