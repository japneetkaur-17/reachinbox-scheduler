import { createContext, useContext, type ReactNode } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import type { EmailStats } from '../types/api';

interface StatsState {
  stats: EmailStats | null;
  refreshStats: () => Promise<void>;
}

const StatsContext = createContext<StatsState | null>(null);

/** Sidebar counts (Scheduled / Sent), polled every 5s and refreshable after a schedule. */
export function StatsProvider({ children }: { children: ReactNode }) {
  const { data, refresh } = usePolling(() => api.stats(), [], 5000);
  return <StatsContext.Provider value={{ stats: data, refreshStats: refresh }}>{children}</StatsContext.Provider>;
}

export function useStats(): StatsState {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used inside <StatsProvider>');
  return ctx;
}
