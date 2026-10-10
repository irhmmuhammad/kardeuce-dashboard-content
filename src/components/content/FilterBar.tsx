import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, FunnelX, Search, X } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { OptionList, type Option } from '@/components/ui/OptionList';
import { useUI, activeFilterCount } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { cn } from '@/lib/utils';
import type { ContentFilters } from '@/types';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import { useOwnerOptions, usePillarOptions, useStatusOptions, useTypeOptions } from './Pickers';

interface FilterChipProps {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  icon?: ReactNode;
}

export function FilterChip({ label, options, value, onChange, icon }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const active = value.length > 0;
  const summary = active ? (value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? value[0] : `${value.length} selected`) : null;
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] border px-2.5 text-[12.5px] font-medium transition-colors',
          active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:border-line-strong hover:text-ink',
        )}
      >
        {icon}
        {label}
        {summary && <span className={cn('max-w-[110px] truncate', active ? 'text-brand' : '')}>: {summary}</span>}
        <ChevronDown className={cn('h-3 w-3', active ? 'text-white/60' : 'text-ink-4')} />
      </button>
      <Popover open={open} anchor={ref.current} onClose={() => setOpen(false)} width={230}>
        <OptionList
          multiple
          options={options}
          selected={value}
          searchable={options.length > 7}
          onSelect={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
          footer={
            active ? (
              <button type="button" onClick={() => onChange([])} className="w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-ink-3 hover:bg-muted hover:text-ink">
                Clear {label.toLowerCase()} filter
              </button>
            ) : undefined
          }
        />
      </Popover>
    </>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !t.closest('input, textarea, [contenteditable]')) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (onChange(''), ref.current?.blur())}
        placeholder={placeholder ?? 'Search…'}
        className="h-8 w-full rounded-[9px] border border-line bg-white pr-12 pl-8 text-[12.5px] outline-none placeholder:text-ink-4 focus:border-ink-3 focus:ring-4 focus:ring-brand/30"
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-ink-4 hover:text-ink" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="kbd pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">/</span>
      )}
    </div>
  );
}

/** Filters for the content plan (search + platform/pillar/type/status/PIC). */
export function FilterBar({ className, extra }: { className?: string; extra?: ReactNode }) {
  const filters = useUI((s) => s.filters);
  const setFilters = useUI((s) => s.setFilters);
  const clearFilters = useUI((s) => s.clearFilters);
  const platforms = useWorkspace((s) => s.settings.platforms);
  const pillarOptions = usePillarOptions();
  const typeOptions = useTypeOptions();
  const statusOptions = useStatusOptions();
  const ownerOptions = useOwnerOptions();
  const count = activeFilterCount(filters);
  const set = (k: keyof ContentFilters) => (v: string[]) => setFilters({ [k]: v });

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <SearchInput value={filters.search} onChange={(v) => setFilters({ search: v })} placeholder="Search judul, brief, caption…" className="w-full sm:w-52 2xl:w-64" />
      <FilterChip
        label="Platform"
        options={platforms.map((p) => ({ value: p, label: p, render: <span className="inline-flex items-center gap-2"><PlatformIcon platform={p} /> {p}</span> }))}
        value={filters.platforms}
        onChange={set('platforms')}
      />
      <FilterChip label="Pillar" options={pillarOptions} value={filters.pillars} onChange={set('pillars')} />
      <FilterChip label="Type" options={typeOptions} value={filters.types} onChange={set('types')} />
      <FilterChip label="Status" options={statusOptions} value={filters.statuses} onChange={set('statuses')} />
      <FilterChip label="PIC" options={[{ value: '__none', label: 'Unassigned' }, ...ownerOptions]} value={filters.owners} onChange={set('owners')} />
      {count > 0 && (
        <button type="button" onClick={clearFilters} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-[12.5px] font-medium text-ink-3 hover:bg-muted hover:text-ink">
          <FunnelX className="h-3.5 w-3.5" /> Clear Filters
        </button>
      )}
      {extra}
    </div>
  );
}
