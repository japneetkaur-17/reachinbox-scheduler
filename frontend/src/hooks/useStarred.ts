import { useCallback, useEffect, useState } from 'react';

const KEY = 'starred-emails';

function read(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as number[]);
  } catch {
    return new Set();
  }
}

/**
 * Star state for the ☆ icon on each email. Stars are a per-browser convenience,
 * so they live in localStorage (not the DB) and sync across open tabs.
 */
export function useStarred() {
  const [starred, setStarred] = useState<Set<number>>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && setStarred(read());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((id: number) => {
    setStarred((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable: keep in memory only
      }
      return next;
    });
  }, []);

  return { isStarred: (id: number) => starred.has(id), toggle };
}
