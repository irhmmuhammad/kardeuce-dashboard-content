import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: string;
  render?: ReactNode;
  hint?: string;
}

interface OptionListProps {
  options: Option[];
  selected: string[];
  onSelect: (value: string) => void;
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  footer?: ReactNode;
  emptyLabel?: string;
}

/** Keyboard-navigable option list used inside popovers (selects, filters). */
export function OptionList({
  options,
  selected,
  onSelect,
  multiple,
  searchable,
  placeholder = 'Search…',
  footer,
  emptyLabel = 'No options',
}: OptionListProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => selected.includes(o.value))));
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => (query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchable) inputRef.current?.focus();
      else listRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [searchable]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(visible.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = visible[active];
      if (o) onSelect(o.value);
    }
  };

  return (
    <div onKeyDown={onKeyDown} className="flex flex-col">
      {searchable && (
        <div className="relative mb-1 border-b border-line px-1 pb-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-[60%] text-ink-4" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={placeholder}
            className="h-8 w-full rounded-lg bg-transparent pr-2 pl-7 text-[13px] outline-none placeholder:text-ink-4"
          />
        </div>
      )}
      <div ref={listRef} tabIndex={-1} role="listbox" className="scrollbar-thin max-h-72 overflow-y-auto outline-none">
        {visible.length === 0 && <div className="px-3 py-2 text-[12.5px] text-ink-4">{emptyLabel}</div>}
        {visible.map((o, i) => {
          const isSel = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={isSel}
              data-index={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => onSelect(o.value)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink',
                i === active && 'bg-muted',
              )}
            >
              {multiple && (
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border',
                    isSel ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white',
                  )}
                >
                  {isSel && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{o.render ?? o.label}</span>
              {o.hint && <span className="text-[11px] text-ink-4">{o.hint}</span>}
              {!multiple && isSel && <Check className="h-3.5 w-3.5 text-ink" strokeWidth={2.5} />}
            </button>
          );
        })}
      </div>
      {footer && <div className="mt-1 border-t border-line pt-1">{footer}</div>}
    </div>
  );
}
