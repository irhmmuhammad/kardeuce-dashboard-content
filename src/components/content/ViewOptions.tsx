import { useRef, useState } from 'react';
import { ArrowDownUp, Check, Columns3, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { DEFAULT_VISIBLE_COLUMNS, useUI } from '@/store/ui';
import { cn } from '@/lib/utils';
import { COLUMNS, SORT_OPTIONS } from './columns';

export function ViewOptions() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const visible = useUI((s) => s.visibleColumns);
  const toggle = useUI((s) => s.toggleColumn);
  const setVisible = useUI((s) => s.setVisibleColumns);
  const freezeUntil = useUI((s) => s.freezeUntil);
  const setFreezeUntil = useUI((s) => s.setFreezeUntil);
  const density = useUI((s) => s.rowDensity);
  const setDensity = useUI((s) => s.setRowDensity);
  const hidden = COLUMNS.filter((c) => !c.locked && !visible.includes(c.key)).length;

  return (
    <>
      <Button ref={ref} size="sm" icon={<Columns3 className="h-3.5 w-3.5" />} onClick={() => setOpen((o) => !o)}>
        View Options
        {hidden > 0 && <span className="hidden rounded-md bg-muted px-1.5 text-[11px] text-ink-3 2xl:inline">{hidden} hidden</span>}
      </Button>
      <Popover open={open} anchor={ref.current} onClose={() => setOpen(false)} align="end" width={290} className="p-0">
        <div className="border-b border-line p-3">
          <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Freeze columns</div>
          <Segmented
            size="sm"
            value={freezeUntil}
            onChange={setFreezeUntil}
            options={[
              { value: 'none', label: 'None' },
              { value: 'publishDate', label: 'No + Date' },
              { value: 'title', label: 'Up to Judul' },
            ]}
          />
          <div className="mt-3 mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Row density</div>
          <Segmented
            size="sm"
            value={density}
            onChange={setDensity}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </div>
        <div className="p-1.5">
          <div className="flex items-center justify-between px-1.5 pt-1 pb-1.5">
            <span className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Columns</span>
            <button type="button" onClick={() => setVisible(DEFAULT_VISIBLE_COLUMNS)} className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink">
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
          <div className="scrollbar-thin max-h-72 overflow-y-auto">
            {COLUMNS.map((c) => {
              const on = c.locked || visible.includes(c.key);
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={c.locked}
                  onClick={() => toggle(c.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <Icon className="h-3.5 w-3.5 text-ink-4" />
                  <span className={cn('flex-1', !on && 'text-ink-4')}>{c.label}</span>
                  {c.optional && <span className="rounded bg-muted px-1 text-[10px] text-ink-4">optional</span>}
                  {c.locked ? <span className="text-[10.5px] text-ink-4">always</span> : on ? <Eye className="h-3.5 w-3.5 text-ink-2" /> : <EyeOff className="h-3.5 w-3.5 text-ink-4" />}
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </>
  );
}

export function SortMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const sort = useUI((s) => s.sort);
  const setSort = useUI((s) => s.setSort);
  const label = SORT_OPTIONS.find((o) => o.key === sort.key)?.label ?? 'Date Post';
  return (
    <>
      <Button ref={ref} size="sm" icon={<ArrowDownUp className="h-3.5 w-3.5" />} onClick={() => setOpen((o) => !o)}>
        <span className="hidden 2xl:inline">Sort:</span> {label}
        <span className="text-ink-4">{sort.dir === 'asc' ? '↑' : '↓'}</span>
      </Button>
      <Popover open={open} anchor={ref.current} onClose={() => setOpen(false)} align="end" width={220}>
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setSort(o.key, sort.key === o.key ? sort.dir : 'asc')}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-muted"
          >
            <span className="flex-1">{o.label}</span>
            {sort.key === o.key && <Check className="h-3.5 w-3.5" />}
          </button>
        ))}
        <div className="my-1 h-px bg-line" />
        <div className="flex gap-1 p-1">
          {(['asc', 'desc'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setSort(sort.key, d)}
              className={cn('flex-1 rounded-lg py-1.5 text-[12px] font-medium', sort.dir === d ? 'bg-ink text-white' : 'bg-muted text-ink-2 hover:text-ink')}
            >
              {d === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
