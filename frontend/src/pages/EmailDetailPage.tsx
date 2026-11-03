import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ExternalLink } from 'lucide-react';
import { IconButton } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { FullPageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StarButton } from '../components/mail/StarButton';
import { useAuth } from '../context/AuthContext';
import { useStarred } from '../hooks/useStarred';
import { api, ApiError } from '../lib/api';
import { formatDetailTime, nameFromEmail } from '../lib/format';
import type { EmailDetail } from '../types/api';

export function EmailDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isStarred, toggle } = useStarred();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const emailId = Number(id);
    if (!Number.isInteger(emailId)) return setError('Email not found');
    api
      .getEmail(emailId)
      .then((r) => setEmail(r.item))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load email'));
  }, [id]);

  if (error) return <EmptyState title={error} description="It may have been deleted or belong to another account." />;
  if (!email) return <FullPageSpinner />;

  const when = email.sent_at ?? email.scheduled_at;

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="Back" onClick={() => navigate(-1)} className="text-ink">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <h1 className="truncate text-xl text-ink">{email.subject}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StarButton starred={isStarred(email.id)} onToggle={() => toggle(email.id)} />
          <span className="mx-1 h-6 w-px bg-line" />
          {user && <Avatar src={user.avatarUrl} name={user.name} size={28} />}
        </div>
      </header>

      <article className="mx-auto flex max-w-[960px] gap-4 px-5 pb-16 pt-4">
        <Avatar name={email.sender_email} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-semibold text-ink">{nameFromEmail(email.sender_email)}</span>{' '}
                <span className="text-xs text-ink-muted">&lt;{email.sender_email}&gt;</span>
              </p>
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-ink-muted hover:text-ink"
              >
                to {email.recipient}
                <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="flex flex-none flex-col items-end gap-1">
              <span className="text-xs text-ink-muted">{formatDetailTime(when)}</span>
              <StatusBadge email={email} />
            </div>
          </div>

          {showDetails && (
            <dl className="mt-3 grid max-w-md grid-cols-[110px_1fr] gap-y-1 rounded-lg bg-[#FAFAFA] p-3 text-xs">
              <dt className="text-ink-muted">Scheduled for</dt>
              <dd>{formatDetailTime(email.scheduled_at)}</dd>
              <dt className="text-ink-muted">Sent at</dt>
              <dd>{formatDetailTime(email.sent_at)}</dd>
              <dt className="text-ink-muted">Attempts</dt>
              <dd>{email.attempts}</dd>
              {!!email.reschedule_count && (
                <>
                  <dt className="text-ink-muted">Rate-limited</dt>
                  <dd>deferred {email.reschedule_count}× to a later hour</dd>
                </>
              )}
              {email.error && (
                <>
                  <dt className="text-ink-muted">Error</dt>
                  <dd className="text-red-600">{email.error}</dd>
                </>
              )}
            </dl>
          )}

          {/* Body HTML was sanitized server-side (allowlist) before it was stored. */}
          <div className="email-body mt-6 text-sm leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: email.body }} />

          {email.preview_url && (
            <a
              href={email.preview_url}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink hover:bg-field"
            >
              <ExternalLink className="h-3.5 w-3.5 text-brand-500" />
              Open in Ethereal
            </a>
          )}
        </div>
      </article>
    </div>
  );
}
