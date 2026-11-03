import { StatusBadge } from '../ui/StatusBadge';
import { StarButton } from './StarButton';
import type { EmailItem } from '../../types/api';

interface EmailRowProps {
  email: EmailItem;
  starred: boolean;
  onToggleStar: () => void;
  onOpen: () => void;
}

/** One line in the list: "To: …" | status pill | **subject** - preview | ☆ */
export function EmailRow({ email, starred, onToggleStar, onOpen }: EmailRowProps) {
  const deferred = email.status === 'scheduled' && (email.reschedule_count ?? 0) > 0;

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="flex cursor-pointer items-center gap-4 border-b border-line px-5 py-3.5 text-[13px] transition-colors hover:bg-[#FAFAFA] focus:bg-[#FAFAFA] focus:outline-none"
    >
      <span className="w-44 flex-none truncate text-ink" title={email.recipient}>
        <span>To: </span>
        {email.recipient}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-2">
        <StatusBadge email={email} />
        {deferred && (
          <span className="flex-none text-[11px] text-[#E8590C]" title="Hourly limit reached - moved to the next hour window">
            rate-limited
          </span>
        )}
        <span className="min-w-0 truncate">
          <span className="font-medium text-ink">{email.subject}</span>
          {email.body && <span className="text-ink-faint"> - {email.body}</span>}
        </span>
      </span>

      <StarButton starred={starred} onToggle={onToggleStar} />
    </li>
  );
}
