import type { AuditResult } from '../types';
import { EFFORT_LABELS, formatWeight } from '../lib/format';

export type ExportFormat = 'json' | 'csv' | 'markdown';

export function exportData(data: AuditResult, format: ExportFormat): void {
  const timestamp = new Date().toISOString().split('T')[0];
  const base = `dsaudit-${timestamp}`;

  switch (format) {
    case 'json':
      downloadFile(JSON.stringify(data, null, 2), `${base}.json`, 'application/json');
      break;
    case 'csv':
      downloadFile(toCSV(data), `${base}.csv`, 'text/csv');
      break;
    case 'markdown':
      downloadFile(toMarkdown(data), `${base}.md`, 'text/markdown');
      break;
  }
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function toCSV(data: AuditResult): string {
  const headers = [
    'Category',
    'Score',
    'Deterministic Score',
    'Judge Score',
    'Grade',
    'Weight',
    'Findings',
    'Errors',
    'Warnings',
  ];

  const rows = (data.categories ?? []).map(cat => {
    const errorCount = cat.findings?.filter(f => f.type === 'error').length ?? 0;
    const warningCount = cat.findings?.filter(f => f.type === 'warning').length ?? 0;
    return [
      cat.name,
      cat.score,
      cat.deterministicScore ?? '',
      cat.judge?.score ?? '',
      cat.grade,
      formatWeight(cat.weight),
      cat.findings?.length ?? 0,
      errorCount,
      warningCount,
    ];
  });

  rows.push(['OVERALL', data.overallScore, '', '', data.overallGrade, '100%', '', '', '']);

  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}

function toMarkdown(data: AuditResult): string {
  const lines: string[] = [];

  lines.push('# Design System Audit Report');
  lines.push('');
  lines.push(`**Date:** ${new Date(data.timestamp).toLocaleString()}  `);
  lines.push(`**Project:** ${data.projectPath}  `);
  lines.push(`**Overall Score:** ${data.overallScore}/100 (Grade ${data.overallGrade})  `);
  lines.push(`**Files Scanned:** ${data.metadata.filesScanned}`);
  lines.push('');

  if (data.partial && data.metadata.failedCategories?.length) {
    lines.push('> **Partial result** — the following categories failed to run and are');
    lines.push('> excluded from the overall score:');
    data.metadata.failedCategories.forEach(f => {
      lines.push(`> - ${f.id}: ${f.error}`);
    });
    lines.push('');
  }

  if (data.aiInsights?.summary) {
    lines.push('## AI Insights');
    lines.push('');
    lines.push(data.aiInsights.summary);
    lines.push('');
    if (data.aiInsights.strengths?.length) {
      lines.push('**Strengths**');
      data.aiInsights.strengths.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }
    if (data.aiInsights.improvements?.length) {
      lines.push('**Improvements**');
      data.aiInsights.improvements.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }
  }

  lines.push('## Category Scores');
  lines.push('');
  lines.push('| Category | Score | Grade | Weight |');
  lines.push('|----------|-------|-------|--------|');
  data.categories.forEach(cat => {
    lines.push(`| ${cat.name} | ${cat.score}/100 | ${cat.grade} | ${formatWeight(cat.weight)} |`);
  });
  lines.push('');

  lines.push('## Detailed Findings');
  lines.push('');
  data.categories.forEach(cat => {
    lines.push(`### ${cat.name}`);
    lines.push('');
    lines.push(`**Score:** ${cat.score}/100 (Grade ${cat.grade})`);
    if (cat.judge) {
      lines.push('');
      lines.push(
        `AI judge score: ${cat.judge.score}/100 (${cat.judge.confidence} confidence, ` +
          `model: ${cat.judge.model}). Deterministic score: ${cat.deterministicScore ?? cat.score}.`
      );
    }
    lines.push('');

    const successes = cat.findings?.filter(f => f.type === 'success') ?? [];
    const issues = cat.findings?.filter(f => f.type !== 'success') ?? [];

    if (successes.length > 0) {
      lines.push(`#### What's working (${successes.length})`);
      lines.push('');
      successes.forEach(f => lines.push(`- ${f.message}`));
      lines.push('');
    }
    if (issues.length > 0) {
      lines.push(`#### Issues (${issues.length})`);
      lines.push('');
      issues.forEach(f => {
        const judgeTag = f.id?.startsWith('judge-') ? ' _(AI judge)_' : '';
        lines.push(`- **[${f.severity}]** ${f.message}${judgeTag}`);
        if (f.suggestion) lines.push(`  - Suggestion: ${f.suggestion}`);
      });
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  });

  if ((data.recommendations?.length ?? 0) > 0) {
    lines.push('## Recommendations');
    lines.push('');
    (['high', 'medium', 'low'] as const).forEach(priority => {
      const recs = data.recommendations.filter(r => r.priority === priority);
      if (recs.length === 0) return;
      lines.push(`### ${priority.charAt(0).toUpperCase() + priority.slice(1)} priority`);
      lines.push('');
      recs.forEach(rec => {
        lines.push(`- **${rec.title}** (${EFFORT_LABELS[rec.effort] ?? rec.effort})`);
        lines.push(`  ${rec.description}`);
        if (rec.implementation) lines.push(`  - Implementation: ${rec.implementation}`);
      });
      lines.push('');
    });
  }

  return lines.join('\n');
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
