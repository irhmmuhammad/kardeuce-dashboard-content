import { useRef, useState, type ReactNode } from 'react';
import { Popover } from './Popover';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
}

interface MenuProps {
  trigger: (props: { ref: React.Ref<HTMLButtonElement>; onClick: () => void; open: boolean }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  width?: number;
}

export function Menu({ trigger, items, align = 'end', width = 200 }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      {trigger({ ref, onClick: () => setOpen((o) => !o), open })}
      <Popover open={open} anchor={ref.current} onClose={() => setOpen(false)} align={align} width={width}>
        {items.map((item, i) => (
          <div key={i}>
            {item.divider && <div className="my-1 h-px bg-line" />}
            <button
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40',
                item.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-muted',
              )}
            >
              {item.icon && <span className="flex h-4 w-4 items-center justify-center opacity-80">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <span className="text-[11px] text-ink-4">{item.shortcut}</span>}
            </button>
          </div>
        ))}
      </Popover>
    </>
  );
}
