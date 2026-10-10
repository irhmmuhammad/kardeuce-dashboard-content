import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">{label}</span>
        {hint && <span className="mb-1.5 text-[11px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Textarea that grows with its content. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }>(
  function AutoTextarea({ minRows = 2, className, value, ...rest }, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
    useEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);
    return <textarea ref={inner} rows={minRows} value={value} className={cn('textarea resize-none', className)} {...rest} />;
  },
);

interface TagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
  tagClassName?: string;
}

/** Chips input: Enter or comma adds, Backspace removes last. */
export function TagInput({ value, onChange, placeholder = 'Add…', className, tagClassName }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().replace(/,$/, '');
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-white px-2 py-1.5 focus-within:border-ink-3 focus-within:ring-4 focus-within:ring-brand/30',
        className,
      )}
    >
      {value.map((tag) => (
        <span key={tag} className={cn('inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium text-ink-2', tagClassName)}>
          {tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="text-ink-4 hover:text-ink" aria-label={`Remove ${tag}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={value.length ? '' : placeholder}
        className="h-6 min-w-[80px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-4"
      />
    </div>
  );
}
