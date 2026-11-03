import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Clock, Paperclip } from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { RecipientInput } from '../components/compose/RecipientInput';
import { RichTextEditor } from '../components/compose/RichTextEditor';
import { SendLaterPopover } from '../components/compose/SendLaterPopover';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useStats } from '../context/StatsContext';
import type { Sender } from '../types/api';

type FieldErrors = Partial<Record<'recipients' | 'subject' | 'body' | 'delay' | 'hourlyLimit', string>>;

function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <label htmlFor={htmlFor} className="w-14 flex-none pt-2.5 text-xs font-medium text-ink">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ComposePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshStats } = useStats();
  const editorRef = useRef<HTMLDivElement>(null);

  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState<string>('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [delay, setDelay] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .senders()
      .then((r) => setSenders(r.items))
      .catch(() => toast.error('Could not load senders'));
  }, [toast]);

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!recipients.length) e.recipients = 'Add recipients or upload a list';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!editorRef.current?.textContent?.trim()) e.body = 'Write a message';
    const d = delay === '' ? 0 : Number(delay);
    if (!Number.isFinite(d) || d < 0) e.delay = 'Delay must be 0 or more seconds';
    const h = Number(hourlyLimit);
    if (!Number.isInteger(h) || h < 1) e.hourlyLimit = 'Hourly limit must be at least 1';
    return e;
  };

  const openSchedule = () => {
    const e = validate();
    setErrors(e);
    const first = Object.values(e)[0];
    if (first) return toast.error(first);
    setScheduleOpen(true);
  };

  const submit = async (when: Date) => {
    setSubmitting(true);
    try {
      const res = await api.schedule({
        subject: subject.trim(),
        body: bodyHtml,
        recipients,
        startTime: when.toISOString(),
        delayBetweenMs: Math.round(Number(delay || 0) * 1000),
        hourlyLimit: Number(hourlyLimit),
        senderId: senderId ? Number(senderId) : undefined,
      });
      toast.success(
        `Scheduled ${res.scheduled.toLocaleString()} email${res.scheduled === 1 ? '' : 's'}` +
          (res.skippedInvalid ? ` (${res.skippedInvalid} invalid skipped)` : ''),
      );
      void refreshStats();
      navigate('/scheduled');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <IconButton label="Back" onClick={() => navigate(-1)} className="text-ink">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <h1 className="text-xl font-medium text-ink">Compose New Email</h1>
        </div>

        <div className="relative flex items-center gap-2">
          <IconButton label="Attachments are not supported yet" disabled>
            <Paperclip className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton label="Pick a send time" onClick={openSchedule}>
            <Clock className="h-[18px] w-[18px] text-brand-500" />
          </IconButton>
          <Button variant="outline" size="sm" onClick={openSchedule}>
            Send Later
          </Button>
          <SendLaterPopover open={scheduleOpen} onClose={() => setScheduleOpen(false)} onConfirm={submit} submitting={submitting} />
        </div>
      </header>

      <form className="mx-auto max-w-[885px] space-y-3 px-5 pb-16 pt-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <FieldRow label="From" htmlFor="from">
          <div className="relative inline-block">
            <select
              id="from"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="h-9 appearance-none rounded-md bg-field py-1 pl-3 pr-8 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All senders (rotate)</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.email}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          </div>
        </FieldRow>

        <FieldRow label="To">
          <RecipientInput value={recipients} onChange={setRecipients} invalid={Boolean(errors.recipients)} />
        </FieldRow>

        <FieldRow label="Subject" htmlFor="subject">
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={`input-line ${errors.subject ? '!border-red-400' : ''}`}
          />
        </FieldRow>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
          <label className="flex items-center gap-3 text-xs font-medium text-ink">
            Delay between 2 emails
            <span className="relative">
              <input
                type="number"
                min={0}
                step={1}
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                placeholder="00"
                title="Seconds between two consecutive emails"
                className={`input-box pr-6 ${errors.delay ? '!border-red-400' : ''}`}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint">s</span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-xs font-medium text-ink">
            Hourly Limit
            <input
              type="number"
              min={1}
              step={1}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              placeholder="00"
              title="Maximum emails from this campaign per hour"
              className={`input-box ${errors.hourlyLimit ? '!border-red-400' : ''}`}
            />
          </label>
        </div>

        <RichTextEditor editorRef={editorRef} onChange={setBodyHtml} invalid={Boolean(errors.body)} />
      </form>
    </div>
  );
}
