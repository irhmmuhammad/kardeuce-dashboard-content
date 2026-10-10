import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean, e: React.MouseEvent) => void;
  label?: string;
  className?: string;
}

export function Checkbox({ checked, indeterminate, onChange, label, className }: CheckboxProps) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e);
      }}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
        on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white hover:border-ink-3',
        className,
      )}
    >
      {indeterminate ? <Minus className="h-3 w-3" strokeWidth={3} /> : checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </button>
  );
}
