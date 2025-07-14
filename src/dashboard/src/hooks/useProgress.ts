import { useState, useEffect, useCallback } from 'react';

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

  const connect = useCallback(() => {
    const eventSource = new EventSource('/api/progress');
    
    eventSource.onopen = () => {
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
            setProgress(0);
            setIsComplete(false);
            setCategoryResults({});
            setMessage(data.message || 'Starting audit...');
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
            setProgress(100);
            setIsComplete(true);
            setCurrentCategory(null);
            setMessage(data.message || 'Audit completed!');
            // Refresh the page after a delay to load new results
            setTimeout(() => {
              window.location.reload();
            }, 2000);
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
      // Attempt to reconnect after 5 seconds
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
    isComplete
  };
}