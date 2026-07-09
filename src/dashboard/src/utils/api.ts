import type { AuditResult } from '../types';

export async function fetchAuditResults(refresh = false): Promise<AuditResult> {
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (refresh) params.set('refresh', 'true');

  const response = await fetch(`/api/results?${params.toString()}`, {
    cache: 'no-cache',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch audit results');
  }
  return response.json() as Promise<AuditResult>;
}

export async function startAudit(): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/start-audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(body.message || 'Failed to start audit');
  }
  return { success: true, message: body.message || 'Audit started' };
}
