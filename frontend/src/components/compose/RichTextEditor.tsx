import { useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronsUpDown,
  Indent,
  Italic,
  List,
  ListOrdered,
  Outdent,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import { IconButton } from '../ui/Button';

interface RichTextEditorProps {
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
  editorRef?: React.RefObject<HTMLDivElement>;
}

const SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
];
const ALIGNS = [
  { cmd: 'justifyLeft', icon: AlignLeft, label: 'Align left' },
  { cmd: 'justifyCenter', icon: AlignCenter, label: 'Align center' },
  { cmd: 'justifyRight', icon: AlignRight, label: 'Align right' },
];

const Divider = () => <span className="mx-1 h-5 w-px bg-line" aria-hidden />;

/**
 * Lightweight rich-text editor (contentEditable + execCommand) with the toolbar
 * from the design. The output HTML is sanitized again by the backend before it
 * is stored or sent, so the editor never has to be trusted.
 */
export function RichTextEditor({ onChange, placeholder = 'Type Your Reply...', invalid, editorRef }: RichTextEditorProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = editorRef ?? ownRef;
  const [sizeIdx, setSizeIdx] = useState(1);
  const [alignIdx, setAlignIdx] = useState(0);

  const exec = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
    emit();
  };

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    // Treat "<br>" / whitespace-only as empty so the placeholder shows again.
    if (!el.textContent?.trim() && !el.querySelector('li')) el.innerHTML = '';
    onChange(el.innerHTML);
  };

  const tool = (label: string, icon: ReactNode, onClick: () => void) => (
    <IconButton label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="h-7 w-7">
      {icon}
    </IconButton>
  );

  const AlignIcon = ALIGNS[alignIdx].icon;
  const i = 'h-4 w-4';

  return (
    // Layout follows the design: text first, toolbar under it, blank area below.
    // Clicking anywhere in the blank area puts the cursor in the editor.
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          ref.current?.focus();
        }
      }}
      className={`flex min-h-[400px] cursor-text flex-col rounded-xl bg-[#FAFAFA] p-4 ${invalid ? 'ring-1 ring-red-300' : ''}`}
    >
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-placeholder={placeholder}
        onInput={emit}
        className="rte min-h-[24px] text-sm leading-relaxed text-ink outline-none"
      />

      <div className="mt-4 flex flex-wrap items-center gap-0.5 rounded-lg bg-white px-2 py-1">
        {tool('Undo', <Undo2 className={i} />, () => exec('undo'))}
        {tool('Redo', <Redo2 className={i} />, () => exec('redo'))}
        <Divider />
        <button
          type="button"
          title={`Text size: ${SIZES[sizeIdx].label}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const next = (sizeIdx + 1) % SIZES.length;
            setSizeIdx(next);
            exec('fontSize', SIZES[next].value);
          }}
          className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-ink-faint hover:bg-field hover:text-ink"
        >
          <Type className={i} />
          <ChevronsUpDown className="h-3 w-3" />
        </button>
        <Divider />
        {tool('Bold', <Bold className={i} />, () => exec('bold'))}
        {tool('Italic', <Italic className={i} />, () => exec('italic'))}
        {tool('Underline', <Underline className={i} />, () => exec('underline'))}
        <Divider />
        <button
          type="button"
          title={ALIGNS[alignIdx].label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const next = (alignIdx + 1) % ALIGNS.length;
            setAlignIdx(next);
            exec(ALIGNS[next].cmd);
          }}
          className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-ink-faint hover:bg-field hover:text-ink"
        >
          <AlignIcon className={i} />
          <ChevronsUpDown className="h-3 w-3" />
        </button>
        <Divider />
        {tool('Numbered list', <ListOrdered className={i} />, () => exec('insertOrderedList'))}
        {tool('Bulleted list', <List className={i} />, () => exec('insertUnorderedList'))}
        {tool('Indent', <Indent className={i} />, () => exec('indent'))}
        {tool('Outdent', <Outdent className={i} />, () => exec('outdent'))}
        {tool('Quote', <Quote className={i} />, () => exec('formatBlock', 'blockquote'))}
        {tool('Clear formatting', <RemoveFormatting className={i} />, () => exec('removeFormat'))}
        <Divider />
        {tool('Strikethrough', <Strikethrough className={i} />, () => exec('strikeThrough'))}
      </div>
    </div>
  );
}
