import { useRef, useState } from 'react';
import { Bold, Eye, Heading2, Italic, List, ListOrdered, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutoTextarea } from '@/components/ui/Field';
import { Tooltip } from '@/components/ui/Tooltip';
import { MarkdownLite } from './MarkdownLite';

interface RichTextAreaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
}

/**
 * Lightweight rich-text editor: markdown shortcuts + toolbar + preview.
 * Keeps data as plain text so it survives CSV export and any backend.
 */
export function RichTextArea({ value, onChange, placeholder, minRows = 5, autoFocus }: RichTextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const wrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || 'text';
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };

  const prefixLines = (prefix: (i: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(lineStart, e) || '';
    const replaced = block
      .split('\n')
      .map((l, i) => prefix(i) + l.replace(/^\s*([-*•]|\d+[.)]|#{1,3})\s+/, ''))
      .join('\n');
    onChange(value.slice(0, lineStart) + replaced + value.slice(e));
    requestAnimationFrame(() => el.focus());
  };

  const tools = [
    { icon: Bold, label: 'Bold (⌘B)', run: () => wrap('**') },
    { icon: Italic, label: 'Italic (⌘I)', run: () => wrap('_') },
    { icon: Heading2, label: 'Heading', run: () => prefixLines(() => '## ') },
    { icon: List, label: 'Bullet list', run: () => prefixLines(() => '- ') },
    { icon: ListOrdered, label: 'Numbered list', run: () => prefixLines((i) => `${i + 1}. `) },
  ];

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-white focus-within:border-ink-3 focus-within:ring-4 focus-within:ring-brand/30">
      <div className="flex items-center gap-0.5 border-b border-line bg-canvas/70 px-1.5 py-1">
        {tools.map(({ icon: Icon, label, run }) => (
          <Tooltip key={label} content={label}>
            <button
              type="button"
              disabled={preview}
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className="rounded-md p-1.5 text-ink-3 hover:bg-white hover:text-ink disabled:opacity-30"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-ink-4 tabular">{value.length} chars</span>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className={cn('ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium', preview ? 'bg-ink text-white' : 'text-ink-3 hover:bg-white hover:text-ink')}
          >
            {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[120px] px-3 py-2.5">{value.trim() ? <MarkdownLite source={value} /> : <p className="text-[13px] text-ink-4">Nothing to preview yet.</p>}</div>
      ) : (
        <AutoTextarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          minRows={minRows}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              wrap('**');
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
              e.preventDefault();
              wrap('_');
            }
          }}
          placeholder={placeholder}
          className="rounded-none border-0 focus:ring-0"
        />
      )}
    </div>
  );
}
