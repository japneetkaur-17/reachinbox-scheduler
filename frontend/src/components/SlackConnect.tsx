import { useEffect, useState } from 'react';
import { api, links } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { SlackStatus } from '../types/api';
import { Spinner } from './ui/Spinner';

const SlackIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" aria-hidden>
    <path fill="#E01E5A" d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" />
    <path fill="#36C5F0" d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" />
    <path fill="#2EB67D" d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" />
    <path fill="#ECB22E" d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
  </svg>
);

/**
 * Sidebar entry for Slack rate-limit alerts.
 * Connect = full-page OAuth redirect; Disconnect = API call. The worker reads
 * the connection on every limit hit, so both take effect immediately.
 */
export function SlackConnect() {
  const toast = useToast();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.slackStatus().then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    void load();
  }, []);

  if (!status) return null;

  const row = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-field';

  if (!status.connected) {
    return (
      <button
        type="button"
        className={row}
        title="Get a Slack message when an hourly limit is hit"
        onClick={() => {
          if (!status.configured) return toast.error('Slack OAuth is not configured on the server');
          window.location.href = links.slackConnect;
        }}
      >
        <SlackIcon />
        <span className="flex-1 text-left">Connect Slack</span>
      </button>
    );
  }

  return (
    <div className={`${row} group`}>
      <SlackIcon />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate">{status.channel ?? 'Slack'}</span>
        <span className="block truncate text-[11px] text-ink-muted">{status.teamName ?? 'Connected'}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        className="text-xs text-ink-faint hover:text-red-600"
        onClick={async () => {
          setBusy(true);
          try {
            await api.slackDisconnect();
            toast.info('Slack disconnected — rate-limit alerts are off');
            await load();
          } catch {
            toast.error('Could not disconnect Slack');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner size="sm" /> : 'Disconnect'}
      </button>
    </div>
  );
}
