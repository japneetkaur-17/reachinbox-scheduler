import { useEffect } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useToast } from '../../context/ToastContext';

const slackMessages: Record<string, ['success' | 'error' | 'info', string]> = {
  connected: ['success', 'Slack connected — check your channel for a confirmation message'],
  denied: ['info', 'Slack connection was cancelled'],
  error: ['error', 'Slack connection failed, please try again'],
  invalid_state: ['error', 'Slack connection expired, please try again'],
  not_configured: ['error', 'Slack OAuth is not configured on the server'],
};

/** Sidebar + main pane, used by the Scheduled and Sent views. */
export function AppLayout() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  // Result of the Slack OAuth redirect (?slack=connected|denied|...): show once, then clean the URL.
  useEffect(() => {
    const slack = params.get('slack');
    if (!slack) return;
    const msg = slackMessages[slack];
    if (msg) toast[msg[0]](msg[1]);
    params.delete('slack');
    setParams(params, { replace: true });
  }, [params, setParams, toast]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
