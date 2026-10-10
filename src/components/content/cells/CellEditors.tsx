import { useEffect, useRef, useState } from 'react';
import { isMac } from '@/lib/utils';

export type CommitReason = 'enter' | 'tab' | 'shift-tab' | 'blur' | 'save';

interface CellInputProps {
  initial: string;
  type?: 'text' | 'date' | 'url';
  placeholder?: string;
  onCommit: (value: string, reason: CommitReason) => void;
  onCancel: () => void;
}

/**
 * In-cell editor. Enter commits (and moves down), Tab commits (and moves
 * right), Escape cancels, blur commits, Cmd/Ctrl+S commits with a toast.
 */
export function CellInput({ initial, type = 'text', placeholder, onCommit, onCancel }: CellInputProps) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (type === 'date') {
      try {
        el.showPicker?.();
      } catch {
        /* showPicker can throw if not user-activated; ignore */
      }
    } else {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [type]);

  const finish = (reason: CommitReason) => {
    if (done.current) return;
    done.current = true;
    onCommit(value, reason);
  };

  return (
    <input
      ref={ref}
      type={type === 'date' ? 'date' : 'text'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish('blur')}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish('enter');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(e.shiftKey ? 'shift-tab' : 'tab');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          onCancel();
        } else if ((isMac() ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          finish('save');
        }
      }}
      className="absolute inset-0 z-[5] h-full w-full border-0 bg-white px-2.5 text-[13px] text-ink outline-none"
    />
  );
}
