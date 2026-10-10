import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { OptionList, type Option } from '@/components/ui/OptionList';
import { PillarBadge, StatusBadge, TypeBadge } from '@/components/badges/Badges';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import { Avatar } from '@/components/ui/Avatar';
import { useWorkspace } from '@/store/workspace';
import { cn } from '@/lib/utils';

interface SelectFieldProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  renderValue?: (v: string) => ReactNode;
  className?: string;
  searchable?: boolean;
  allowClear?: boolean;
}

/** Button + popover select used in forms (drawer, quick add, idea modal). */
export function SelectField({ value, onChange, options, placeholder = 'Select…', renderValue, className, searchable, allowClear }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const opts = allowClear ? [{ value: '', label: 'None', render: <span className="text-ink-4">None</span> }, ...options] : options;
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 text-left text-[13px] transition hover:border-line-strong focus-visible:border-ink-3 focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:outline-none',
          open && 'border-ink-3 ring-4 ring-brand/30',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{value ? (renderValue ? renderValue(value) : value) : <span className="text-ink-4">{placeholder}</span>}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-4" />
      </button>
      <Popover open={open} anchor={ref.current} onClose={() => setOpen(false)} width="anchor">
        <OptionList
          options={opts}
          selected={[value]}
          searchable={searchable}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </Popover>
    </>
  );
}

/* ---- Domain-specific option builders (keep option rendering consistent) ---- */

export function useStatusOptions(): Option[] {
  const statuses = useWorkspace((s) => s.settings.statuses);
  return statuses.map((s) => ({ value: s.name, label: s.name, render: <StatusBadge status={s.name} /> }));
}

export function usePillarOptions(): Option[] {
  const pillars = useWorkspace((s) => s.pillars);
  return pillars.map((p) => ({ value: p.name, label: p.name, render: <PillarBadge pillar={p.name} /> }));
}

export function useTypeOptions(): Option[] {
  const types = useWorkspace((s) => s.settings.contentTypes);
  return types.map((t) => ({ value: t, label: t, render: <TypeBadge type={t} /> }));
}

export function useOwnerOptions(): Option[] {
  const team = useWorkspace((s) => s.settings.team);
  return team.map((t) => ({
    value: t.id,
    label: t.name,
    hint: t.role,
    render: (
      <span className="inline-flex items-center gap-2">
        <Avatar member={t} size={20} /> {t.name}
      </span>
    ),
  }));
}

export function useObjectiveOptions(): Option[] {
  const objectives = useWorkspace((s) => s.settings.objectives);
  return objectives.map((o) => ({ value: o, label: o }));
}

export function OwnerValue({ id }: { id: string }) {
  const member = useWorkspace((s) => s.settings.team.find((t) => t.id === id));
  if (!member) return <span className="text-ink-4">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar member={member} size={20} />
      <span className="truncate">{member.name}</span>
    </span>
  );
}

/** Toggle chips for multi-platform selection. */
export function PlatformToggle({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const platforms = useWorkspace((s) => s.settings.platforms);
  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-medium transition-colors',
              on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:border-line-strong',
            )}
            aria-pressed={on}
          >
            <PlatformIcon platform={p} />
            {p}
          </button>
        );
      })}
    </div>
  );
}
