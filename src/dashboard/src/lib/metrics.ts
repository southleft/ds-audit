/**
 * Defensive accessors for `CategoryResult.metrics` (typed as
 * `Record<string, unknown>`). Older results.json files may lack keys, so
 * every accessor returns `undefined` rather than throwing, and views render
 * sensible empty states.
 */
export type Metrics = Record<string, unknown> | undefined;

export function num(metrics: Metrics, key: string): number | undefined {
  const value = metrics?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function bool(metrics: Metrics, key: string): boolean | undefined {
  const value = metrics?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function str(metrics: Metrics, key: string): string | undefined {
  const value = metrics?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function rec(metrics: Metrics, key: string): Record<string, unknown> | undefined {
  const value = metrics?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function arr<T = unknown>(metrics: Metrics, key: string): T[] | undefined {
  const value = metrics?.[key];
  return Array.isArray(value) ? (value as T[]) : undefined;
}

export function strArr(metrics: Metrics, key: string): string[] | undefined {
  const value = arr(metrics, key);
  if (!value) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}
