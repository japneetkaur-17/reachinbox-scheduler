import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListToolbar, type FilterOption } from '../components/mail/ListToolbar';
import { EmailList } from '../components/mail/EmailList';
import { Button } from '../components/ui/Button';
import { usePolling } from '../hooks/usePolling';
import { useDebounced } from '../hooks/useDebounced';
import { useToast } from '../context/ToastContext';
import { useStats } from '../context/StatsContext';
import { api } from '../lib/api';
import type { EmailTab } from '../types/api';

/** Everything that differs between the Scheduled and Sent views lives here. */
const TAB_CONFIG: Record<EmailTab, { filters: FilterOption[]; empty: { title: string; description: string } }> = {
  scheduled: {
    filters: [
      { value: 'all', label: 'All' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'processing', label: 'Sending' },
    ],
    empty: { title: 'No scheduled emails', description: 'Compose an email and schedule it — it waits here until it is sent.' },
  },
  sent: {
    filters: [
      { value: 'all', label: 'All' },
      { value: 'sent', label: 'Sent' },
      { value: 'failed', label: 'Failed' },
    ],
    empty: { title: 'No sent emails yet', description: 'Emails show up here once the worker delivers them (or fails after retries).' },
  },
};

export function MailboxPage({ tab }: { tab: EmailTab }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshStats } = useStats();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterOption['value']>('all');
  const search = useDebounced(query.trim(), 350);

  const list = usePolling(() => (search ? api.searchEmails(search, tab) : api.listEmails(tab)), [tab, search], 5000);

  useEffect(() => {
    if (list.error) toast.error(list.error);
  }, [list.error, toast]);

  const items = useMemo(() => {
    const all = list.data?.items ?? [];
    return filter === 'all' ? all : all.filter((e) => e.status === filter);
  }, [list.data, filter]);

  const config = TAB_CONFIG[tab];
  const empty =
    search || filter !== 'all'
      ? { title: 'No matches', description: 'No emails match your search or filter.' }
      : {
          ...config.empty,
          action:
            tab === 'scheduled' ? (
              <Button variant="outline" size="sm" onClick={() => navigate('/compose')}>
                Compose
              </Button>
            ) : undefined,
        };

  return (
    <div>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        filterOptions={config.filters}
        onFilter={setFilter}
        onRefresh={async () => {
          await Promise.all([list.refresh(), refreshStats()]);
        }}
      />
      <EmailList items={items} loading={list.loading} empty={empty} />
      {!search && list.data?.total !== undefined && list.data.total > (list.data.items?.length ?? 0) && (
        <p className="px-5 py-3 text-xs text-ink-muted">
          Showing the first {list.data.items.length} of {list.data.total.toLocaleString()} emails.
        </p>
      )}
    </div>
  );
}
