import type { AuditResult, CategoryResult, Finding } from '../types';

/** Consistent severity color coding across the whole dashboard. */
export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'gray',
};

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;

export const PRIORITY_COLORS: Record<string, string> = {
  high: 'red',
  medium: 'yellow',
  low: 'gray',
};

export const IMPACT_COLORS: Record<string, string> = {
  high: 'teal',
  medium: 'blue',
  low: 'gray',
};

/** Honest effort labels — the enum the engine emits, no invented hours. */
export const EFFORT_LABELS: Record<string, string> = {
  'quick-win': 'Quick win',
  'medium-lift': 'Medium lift',
  'heavy-lift': 'Heavy lift',
};

export const EFFORT_COLORS: Record<string, string> = {
  'quick-win': 'green',
  'medium-lift': 'blue',
  'heavy-lift': 'violet',
};

export function scoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

/** Weight is a fraction (0-1) stamped by the engine. */
export function formatWeight(weight: number | undefined): string {
  if (weight === undefined) return '—';
  return `${Math.round(weight * 100)}%`;
}

/** Judge-originated findings carry an engine-stamped `judge-` id prefix. */
export function isJudgeFinding(finding: Finding): boolean {
  return typeof finding.id === 'string' && finding.id.startsWith('judge-');
}

/**
 * Look up a category by id — never by display name (names like
 * "Tooling & Infrastructure" vary; ids are stable).
 */
export function findCategory(
  result: AuditResult | null | undefined,
  id: string
): CategoryResult | undefined {
  return result?.categories?.find(c => c.id === id);
}

/** Display name for a category id, falling back to a capitalized id. */
export function categoryLabel(result: AuditResult | null | undefined, id: string): string {
  const category = findCategory(result, id);
  if (category?.name) return category.name;
  return id.charAt(0).toUpperCase() + id.slice(1);
}
