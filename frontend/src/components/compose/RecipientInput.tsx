import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { extractEmails, readLeadsFile } from '../../lib/leads';
import { useToast } from '../../context/ToastContext';

const VISIBLE_CHIPS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RecipientInputProps {
  value: string[];
  onChange: (emails: string[]) => void;
  invalid?: boolean;
}

/**
 * "To" field: green chips for each lead, "+N" for the rest, an inline input for
 * typing / pasting addresses, and "Upload List" for CSV/TXT files.
 */
export function RecipientInput({ value, onChange, invalid }: RecipientInputProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const add = (emails: string[]) => {
    const merged = [...new Set([...value, ...emails.map((e) => e.toLowerCase())])];
    onChange(merged);
  };

  const commitDraft = () => {
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    const good = parts.filter((p) => EMAIL_RE.test(p));
    if (good.length) add(good);
    if (parts.length !== good.length) toast.error('Some entries are not valid email addresses');
    setDraft(parts.filter((p) => !EMAIL_RE.test(p)).join(' '));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ';', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const found = extractEmails(e.clipboardData.getData('text'));
    if (found.length > 1) {
      e.preventDefault();
      add(found);
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const emails = await readLeadsFile(file);
      if (!emails.length) return toast.error(`No email addresses found in ${file.name}`);
      add(emails);
      setFileName(file.name);
      toast.success(`${emails.length.toLocaleString()} email${emails.length === 1 ? '' : 's'} detected in ${file.name}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <div>
      <div
        className={`flex min-h-[40px] flex-wrap items-center gap-1.5 border-b py-1.5 ${invalid ? 'border-red-400' : 'border-line'} focus-within:border-brand-500`}
      >
        {shown.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 rounded-full border border-brand-500 bg-white py-0.5 pl-2.5 pr-1 text-xs text-ink">
            {email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onChange(value.filter((v) => v !== email))}
              className="rounded-full p-0.5 text-ink-faint hover:bg-field hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-brand-500 px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            +{hidden.toLocaleString()}
          </button>
        )}
        {expanded && value.length > VISIBLE_CHIPS && (
          <button type="button" onClick={() => setExpanded(false)} className="text-xs text-ink-muted hover:text-ink">
            show less
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => draft.trim() && commitDraft()}
          placeholder={value.length ? '' : 'recipient@example.com'}
          aria-label="Recipients"
          className="min-w-[160px] flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-ink-faint"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          <Upload className="h-4 w-4" />
          Upload List
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {value.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          <span className="font-medium text-brand-600">{value.length.toLocaleString()}</span> email address
          {value.length === 1 ? '' : 'es'} detected{fileName ? ` · ${fileName}` : ''}
          <button type="button" onClick={() => (onChange([]), setFileName(null))} className="ml-2 text-ink-faint underline hover:text-ink">
            clear
          </button>
        </p>
      )}
    </div>
  );
}
