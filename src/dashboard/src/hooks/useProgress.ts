import { useState, useEffect, useCallback, useRef } from 'react';

export interface ProgressUpdate {
  type: 'connected' | 'audit:start' | 'category:start' | 'category:complete' | 'category:error' | 'audit:complete';
  category?: string;
  progress?: number;
  message?: string;
  totalCategories?: number;
  result?: any;
  error?: string;
}

export function useProgress() {
  const [isConnected, setIsConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const [categoryResults, setCategoryResults] = useState<Record<string, any>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [lastAuditTime, setLastAuditTime] = useState<number>(0);
  const [isAuditActive, setIsAuditActive] = useState(false);
  const auditActiveRef = useRef(false);

  const connect = useCallback(() => {
    const eventSource = new EventSource('/api/progress');
    
    eventSource.onopen = () => {
      console.log('[Progress] SSE connection opened');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressUpdate = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            setIsConnected(true);
            break;
            
          case 'audit:start':
            console.log('[Progress] Received audit:start event');
            setProgress(0);
            setIsComplete(false);
            setIsAuditActive(true);
            auditActiveRef.current = true;
            setCategoryResults({});
            setMessage(data.message || 'Starting audit...');
            setLastAuditTime(Date.now());
            break;
            
          case 'category:start':
            setCurrentCategory(data.category || null);
            setProgress(data.progress || 0);
            setMessage(data.message || '');
            break;
            
          case 'category:complete':
            if (data.category && data.result) {
              setCategoryResults(prev => ({
                ...prev,
                [data.category!]: data.result
              }));
            }
            setProgress(data.progress || 0);
            setMessage(data.message || '');
            break;
            
          case 'category:error':
            if (data.category) {
              setCategoryResults(prev => ({
                ...prev,
                [data.category!]: { error: data.error }
              }));
            }
            setProgress(data.progress || 0);
            break;
            
          case 'audit:complete':
            console.log('[Progress] Received audit:complete event');
            setProgress(100);
            setIsComplete(true);
            setIsAuditActive(false);
            auditActiveRef.current = false;
            setCurrentCategory(null);
            setMessage(data.message || 'Audit completed!');
            // Redirect to overview page after a delay
            setTimeout(() => {
              window.location.hash = '#overview';
              window.location.reload();
            }, 2000);
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[Progress] SSE connection error:', error);
      setIsConnected(false);
      eventSource.close();
      // Always try to reconnect
      setTimeout(connect, 5000);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return {
    isConnected,
    progress,
    currentCategory,
    message,
    categoryResults,
    isComplete,
    lastAuditTime,
    isAuditActive
  };
}