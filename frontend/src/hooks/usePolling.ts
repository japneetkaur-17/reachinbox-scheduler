import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches `fetcher` immediately and then every `intervalMs` while the tab is
 * visible. Re-runs from scratch whenever `deps` change. Background refreshes
 * don't flip `loading`, so tables don't flicker.
 */
export function usePolling<T>(fetcher: () => Promise<T>, deps: unknown[], intervalMs = 5000): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);

  const run = useCallback(async (showLoading: boolean) => {
    const id = ++requestId.current;
    if (showLoading) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError((err as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    void run(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run(false);
    }, intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, run]);

  const refresh = useCallback(() => run(false), [run]);
  return { data, loading, error, refresh };
}
