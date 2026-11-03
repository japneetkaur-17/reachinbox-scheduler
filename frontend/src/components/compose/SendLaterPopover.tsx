import { useMemo, useState } from 'react';
import { Popover } from '../ui/Popover';
import { Button } from '../ui/Button';
import { formatPresetLabel, toLocalInputValue } from '../../lib/format';

interface SendLaterPopoverProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (when: Date) => void;
  submitting: boolean;
}

function tomorrowAt(hours: number, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** "Send Later" panel from the design: a date-time picker plus quick presets. */
export function SendLaterPopover({ open, onClose, onConfirm, submitting }: SendLaterPopoverProps) {
  const presets = useMemo(
    () => [
      { label: 'Tomorrow', date: tomorrowAt(9) },
      { label: formatPresetLabel(tomorrowAt(10)), date: tomorrowAt(10) },
      { label: formatPresetLabel(tomorrowAt(11)), date: tomorrowAt(11) },
      { label: formatPresetLabel(tomorrowAt(15)), date: tomorrowAt(15) },
    ],
    // recompute each time the popover opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    if (!value) return setError('Pick a date & time');
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return setError('Invalid date');
    if (when.getTime() < Date.now() - 60_000) return setError('That time is in the past');
    setError(null);
    onConfirm(when);
  };

  return (
    <Popover open={open} onClose={() => !submitting && onClose()} className="right-0 top-full mt-2 w-[272px] p-4">
      <h3 className="text-sm font-medium text-ink">Send Later</h3>

      <label className="mt-4 block">
        <span className="sr-only">Pick date &amp; time</span>
        <input
          type="datetime-local"
          value={value}
          min={toLocalInputValue(new Date())}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          className={`input-line text-xs ${value ? 'text-ink' : 'text-ink-faint'}`}
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      <ul className="mt-3 space-y-0.5">
        {presets.map((p) => {
          const selected = value === toLocalInputValue(p.date);
          return (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => {
                  setValue(toLocalInputValue(p.date));
                  setError(null);
                }}
                className={`w-full rounded-md px-1 py-1.5 text-left text-xs transition-colors ${
                  selected ? 'bg-brand-50 font-medium text-ink' : 'text-ink-muted hover:bg-field hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex items-center justify-end gap-4">
        <button type="button" onClick={onClose} disabled={submitting} className="text-xs font-medium text-ink hover:text-ink-muted">
          Cancel
        </button>
        <Button variant="outline" size="sm" className="!h-7 px-5 text-xs" onClick={confirm} loading={submitting}>
          Done
        </Button>
      </div>
    </Popover>
  );
}
