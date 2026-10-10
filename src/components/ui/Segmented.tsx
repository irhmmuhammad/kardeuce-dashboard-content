import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex items-center rounded-[10px] border border-line bg-muted/70 p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all',
            size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-[12.5px]',
            value === o.value ? 'bg-white text-ink shadow-[0_1px_2px_rgb(23_33_26/0.08)] ring-1 ring-line' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.icon}
          <span className={cn(o.icon && 'hidden sm:inline')}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
