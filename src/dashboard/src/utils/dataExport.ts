import { AuditResult, CategoryResult } from '@types';

export type ExportFormat = 'json' | 'csv' | 'markdown';

export function exportData(
  data: AuditResult,
  format: ExportFormat,
  filename?: string
): void {
  const timestamp = new Date().toISOString().split('T')[0];
  const defaultFilename = `audit-report-${timestamp}`;
  
  switch (format) {
    case 'json':
      exportJSON(data, filename || `${defaultFilename}.json`);
      break;
    case 'csv':
      exportCSV(data, filename || `${defaultFilename}.csv`);
      break;
    case 'markdown':
      exportMarkdown(data, filename || `${defaultFilename}.md`);
      break;
  }
}

function exportJSON(data: AuditResult, filename: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  downloadFile(jsonStr, filename, 'application/json');
}

function exportCSV(data: AuditResult, filename: string): void {
  // Create CSV header
  const headers = [
    'Category',
    'Score',
    'Grade',
    'Weight',
    'Findings Count',
    'Success Count',
    'Warning Count',
    'Error Count'
  ];
  
  // Create CSV rows
  const rows = data.categories.map(cat => {
    const successCount = cat.findings?.filter(f => f.type === 'success').length || 0;
    const warningCount = cat.findings?.filter(f => f.type === 'warning').length || 0;
    const errorCount = cat.findings?.filter(f => f.type === 'error').length || 0;
    
    return [
      cat.name,
      cat.score,
      cat.grade,
      cat.weight,
      cat.findings?.length || 0,
      successCount,
      warningCount,
      errorCount
    ];
  });
  
  // Add summary row
  rows.push([
    'OVERALL',
    data.overallScore,
    data.overallGrade,
    '100',
    data.metadata.filesScanned,
    '',
    '',
    data.metadata.errors.length
  ]);
  
  // Convert to CSV format
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  downloadFile(csvContent, filename, 'text/csv');
}

function exportMarkdown(data: AuditResult, filename: string): void {
  let markdown = `# Design System Audit Report

**Date:** ${new Date(data.timestamp).toLocaleDateString()}  
**Project:** ${data.projectPath}  
**Overall Score:** ${data.overallScore}/100 (Grade ${data.overallGrade})  
**Files Scanned:** ${data.metadata.filesScanned}

## Summary

`;

  // Add AI insights if available
  if (data.aiInsights?.summary) {
    markdown += data.aiInsights.summary + '\n\n';
  }

  // Category scores table
  markdown += `## Category Scores

| Category | Score | Grade | Weight |
|----------|-------|-------|--------|
`;

  data.categories.forEach(cat => {
    markdown += `| ${cat.name} | ${cat.score}/100 | ${cat.grade} | ${cat.weight}% |\n`;
  });

  markdown += '\n## Detailed Analysis\n\n';

  // Detailed category information
  data.categories.forEach(cat => {
    markdown += `### ${cat.name}\n\n`;
    markdown += `**Score:** ${cat.score}/100 (Grade ${cat.grade})\n\n`;
    
    if (cat.findings && cat.findings.length > 0) {
      const successes = cat.findings.filter(f => f.type === 'success');
      const issues = cat.findings.filter(f => f.type !== 'success');
      
      if (successes.length > 0) {
        markdown += `#### ✅ What's Working (${successes.length})\n\n`;
        successes.forEach(f => {
          markdown += `- ${f.message}\n`;
        });
        markdown += '\n';
      }
      
      if (issues.length > 0) {
        markdown += `#### ⚠️ Issues Found (${issues.length})\n\n`;
        issues.forEach(f => {
          const icon = f.type === 'error' ? '❌' : '⚠️';
          markdown += `- ${icon} ${f.message}\n`;
        });
        markdown += '\n';
      }
    }
    
    if (cat.recommendations && cat.recommendations.length > 0) {
      markdown += `#### 📋 Recommendations\n\n`;
      cat.recommendations.forEach(rec => {
        markdown += `**${rec.title}**\n`;
        markdown += `- Priority: ${rec.priority}\n`;
        markdown += `- Effort: ${rec.effort}\n`;
        markdown += `- ${rec.description}\n\n`;
      });
    }
    
    markdown += '---\n\n';
  });

  // Top recommendations
  markdown += `## Top Recommendations\n\n`;
  const highPriorityRecs = data.recommendations.filter(r => r.priority === 'high');
  
  if (highPriorityRecs.length > 0) {
    markdown += `### High Priority\n\n`;
    highPriorityRecs.forEach(rec => {
      markdown += `1. **${rec.title}**\n   ${rec.description}\n\n`;
    });
  }

  downloadFile(markdown, filename, 'text/markdown');
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export chart as image
export async function exportChartAsImage(
  canvasId: string,
  filename: string = 'chart.png'
): Promise<void> {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas not found');
  }
  
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }
  }, 'image/png');
}