import { useState, useEffect, useCallback, useRef } from 'react';

export type ProgressEventType =
  | 'connected'
  | 'audit:start'
  | 'category:start'
  | 'category:complete'
  | 'category:error'
  | 'audit:complete'
  | 'audit:error'
  | 'ai:start'
  | 'ai:category'
  | 'ai:complete'
  | 'ai:error';

export interface ProgressUpdate {
  type: ProgressEventType;
  category?: string;
  progress?: number;
  message?: string;
  totalCategories?: number;
  result?: { score?: number; grade?: string; findings?: unknown[] };
  error?: string;
}

export type CategoryStatus =
  | { state: 'running' }
  | { state: 'complete'; score?: number; grade?: string; findingsCount?: number }
  | { state: 'error'; error?: string };

export type AiPhase = 'idle' | 'running' | 'complete' | 'error';

export interface ProgressState {
  isConnected: boolean;
  isAuditActive: boolean;
  isComplete: boolean;
  /** Set when the whole audit run failed (`audit:error`). */
  auditError: string | null;
  /** From the `audit:start` event — derived from enabled modules, never hardcoded. */
  totalCategories: number | null;
  /** Categories in the order they started. */
  categoryOrder: string[];
  categoryStatus: Record<string, CategoryStatus>;
  currentCategory: string | null;
  progress: number;
  message: string;
  aiPhase: AiPhase;
  aiCurrentCategory: string | null;
  aiError: string | null;
}

const INITIAL_STATE: ProgressState = {
  isConnected: false,
  isAuditActive: false,
  isComplete: false,
  auditError: null,
  totalCategories: null,
  categoryOrder: [],
  categoryStatus: {},
  currentCategory: null,
  progress: 0,
  message: '',
  aiPhase: 'idle',
  aiCurrentCategory: null,
  aiError: null,
};

function completedCount(status: Record<string, CategoryStatus>): number {
  return Object.values(status).filter(s => s.state !== 'running').length;
}

function computeProgress(state: ProgressState): number {
  const total = state.totalCategories ?? state.categoryOrder.length;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completedCount(state.categoryStatus) / total) * 100));
}

export function useProgress(onAuditComplete?: () => void) {
  const [state, setState] = useState<ProgressState>(INITIAL_STATE);
  const completeCallbackRef = useRef(onAuditComplete);
  completeCallbackRef.current = onAuditComplete;

  const connect = useCallback(() => {
    const eventSource = new EventSource('/api/progress');

    eventSource.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true }));
    };

    eventSource.onmessage = event => {
      let data: ProgressUpdate;
      try {
        data = JSON.parse(event.data) as ProgressUpdate;
      } catch {
        return;
      }

      setState(prev => {
        switch (data.type) {
          case 'connected':
            return { ...prev, isConnected: true };

          case 'audit:start':
            return {
              ...INITIAL_STATE,
              isConnected: true,
              isAuditActive: true,
              totalCategories: data.totalCategories ?? null,
              message: data.message || 'Starting audit...',
            };

          case 'category:start': {
            if (!data.category) return prev;
            const next: ProgressState = {
              ...prev,
              isAuditActive: true,
              currentCategory: data.category,
              categoryOrder: prev.categoryOrder.includes(data.category)
                ? prev.categoryOrder
                : [...prev.categoryOrder, data.category],
              categoryStatus: {
                ...prev.categoryStatus,
                [data.category]: { state: 'running' },
              },
              message: data.message || `Auditing ${data.category}...`,
            };
            return { ...next, progress: computeProgress(next) };
          }

          case 'category:complete': {
            if (!data.category) return prev;
            const next: ProgressState = {
              ...prev,
              categoryOrder: prev.categoryOrder.includes(data.category)
                ? prev.categoryOrder
                : [...prev.categoryOrder, data.category],
              categoryStatus: {
                ...prev.categoryStatus,
                [data.category]: {
                  state: 'complete',
                  score: data.result?.score,
                  grade: data.result?.grade,
                  findingsCount: Array.isArray(data.result?.findings)
                    ? data.result.findings.length
                    : undefined,
                },
              },
              currentCategory: prev.currentCategory === data.category ? null : prev.currentCategory,
              message: data.message || '',
            };
            return { ...next, progress: computeProgress(next) };
          }

          case 'category:error': {
            if (!data.category) return prev;
            const next: ProgressState = {
              ...prev,
              categoryOrder: prev.categoryOrder.includes(data.category)
                ? prev.categoryOrder
                : [...prev.categoryOrder, data.category],
              categoryStatus: {
                ...prev.categoryStatus,
                [data.category]: { state: 'error', error: data.error },
              },
              currentCategory: prev.currentCategory === data.category ? null : prev.currentCategory,
            };
            return { ...next, progress: computeProgress(next) };
          }

          case 'ai:start':
            return {
              ...prev,
              aiPhase: 'running',
              aiCurrentCategory: null,
              message: data.message || 'AI judge reviewing...',
            };

          case 'ai:category':
            return {
              ...prev,
              aiPhase: 'running',
              aiCurrentCategory: data.category ?? null,
              message: data.message || `AI judge reviewing ${data.category}...`,
            };

          case 'ai:complete':
            return {
              ...prev,
              aiPhase: 'complete',
              aiCurrentCategory: null,
              message: data.message || 'AI judge review complete',
            };

          case 'ai:error':
            return {
              ...prev,
              aiPhase: 'error',
              aiCurrentCategory: null,
              aiError: data.error ?? 'AI judge review failed',
              message: data.message || 'AI judge review failed — scores are deterministic only',
            };

          case 'audit:complete':
            // Refresh the app's data after a short beat so the completed
            // state is visible before navigating away.
            setTimeout(() => completeCallbackRef.current?.(), 1500);
            return {
              ...prev,
              progress: 100,
              isComplete: true,
              isAuditActive: false,
              currentCategory: null,
              aiCurrentCategory: null,
              aiPhase: prev.aiPhase === 'running' ? 'complete' : prev.aiPhase,
              message: data.message || 'Audit completed!',
            };

          case 'audit:error':
            return {
              ...prev,
              isAuditActive: false,
              isComplete: false,
              currentCategory: null,
              aiCurrentCategory: null,
              auditError: data.error ?? 'Audit failed',
              message: data.error ? `Audit failed: ${data.error}` : 'Audit failed',
            };

          default:
            return prev;
        }
      });
    };

    eventSource.onerror = () => {
      setState(prev => ({ ...prev, isConnected: false }));
      eventSource.close();
      setTimeout(connect, 5000);
    };

    return () => {
      eventSource.close();
      setState(prev => ({ ...prev, isConnected: false }));
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return state;
}
