import { Clock } from 'lucide-react';
import { formatPillTime } from '../../lib/format';
import type { EmailItem } from '../../types/api';

const base = 'inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap';

/**
 * Pill shown before the subject in the list, as in the design:
 *  - scheduled -> orange pill with clock + time ("Tue 9:15:12 AM")
 *  - sent      -> grey "Sent" pill
 *  - plus "Sending" and "Failed" states the design doesn't show.
 */
export function StatusBadge({ email }: { email: Pick<EmailItem, 'status' | 'scheduled_at' | 'error'> }) {
  switch (email.status) {
    case 'scheduled':
      return (
        <span className={`${base} bg-[#FFF1E7] text-[#E8590C]`}>
          <Clock className="h-3 w-3" strokeWidth={2.2} />
          {formatPillTime(email.scheduled_at)}
        </span>
      );
    case 'processing':
      return <span className={`${base} bg-blue-50 text-blue-600`}>Sending…</span>;
    case 'sent':
      return <span className={`${base} bg-[#F1F1F1] text-ink-muted`}>Sent</span>;
    case 'failed':
      return (
        <span className={`${base} bg-red-50 text-red-600`} title={email.error ?? undefined}>
          Failed
        </span>
      );
  }
}
