import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, CircleDot, Copy, Layers, Trash, UserRound, X } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { OptionList, type Option } from '@/components/ui/OptionList';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { addDays } from '@/lib/date';
import { useOwnerOptions, usePillarOptions, useStatusOptions } from './Pickers';
import type { ContentItem } from '@/types';

interface BulkActionBarProps {
  selectedIds: string[];
  onClear: () => void;
  onDelete: (ids: string[]) => void;
}

type Field = 'status' | 'contentPillar' | 'owner' | 'shift';

export function BulkActionBar({ selectedIds, onClear, onDelete }: BulkActionBarProps) {
  const updateContents = useWorkspace((s) => s.updateContents);
  const duplicateContent = useWorkspace((s) => s.duplicateContent);
  const contents = useWorkspace((s) => s.contents);
  const updateContent = useWorkspace((s) => s.updateContent);
  const statusOptions = useStatusOptions();
  const pillarOptions = usePillarOptions();
  const ownerOptions = useOwnerOptions();
  const [open, setOpen] = useState<Field | null>(null);
  const refs = {
    status: useRef<HTMLButtonElement>(null),
    contentPillar: useRef<HTMLButtonElement>(null),
    owner: useRef<HTMLButtonElement>(null),
    shift: useRef<HTMLButtonElement>(null),
  };

  if (!selectedIds.length) return null;
  const n = selectedIds.length;

  const apply = (field: Exclude<Field, 'shift'>, value: string, label: string) => {
    updateContents(selectedIds, { [field]: value } as Partial<ContentItem>);
    setOpen(null);
    toast.success(`${n} item${n > 1 ? 's' : ''} updated`, `${label} → ${value || 'Unassigned'}`);
  };

  const shiftDates = (days: number) => {
    const set = new Set(selectedIds);
    contents.filter((c) => set.has(c.id) && c.publishDate).forEach((c) => updateContent(c.id, { publishDate: addDays(c.publishDate, days) }));
    setOpen(null);
    toast.success(`Moved ${n} item${n > 1 ? 's' : ''} ${days > 0 ? 'later' : 'earlier'} by ${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''}`);
  };

  const options: Record<Exclude<Field, 'shift'>, Option[]> = {
    status: statusOptions,
    contentPillar: pillarOptions,
    owner: [{ value: '', label: 'Unassigned' }, ...ownerOptions],
  };

  const btn = (field: Field, icon: React.ReactNode, label: string) => (
    <button
      key={field}
      ref={refs[field]}
      type="button"
      onClick={() => setOpen(open === field ? null : field)}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-white/85 hover:bg-white/10 hover:text-white"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );

  return createPortal(
    <div className="fixed bottom-5 left-1/2 z-[45] -translate-x-1/2 animate-toast-in">
      <div className="flex items-center gap-0.5 rounded-2xl border border-ink-2 bg-ink p-1.5 pl-3 text-white shadow-[var(--shadow-pop)]">
        <span className="mr-2 inline-flex items-center gap-2 text-[12.5px] font-semibold">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-brand px-1 text-[11px] text-ink tabular">{n}</span>
          selected
        </span>
        <span className="mx-1 h-5 w-px bg-white/15" />
        {btn('status', <CircleDot className="h-3.5 w-3.5" />, 'Status')}
        {btn('contentPillar', <Layers className="h-3.5 w-3.5" />, 'Pillar')}
        {btn('owner', <UserRound className="h-3.5 w-3.5" />, 'PIC')}
        {btn('shift', <CalendarDays className="h-3.5 w-3.5" />, 'Shift date')}
        <button
          type="button"
          onClick={() => {
            selectedIds.forEach((id) => duplicateContent(id));
            toast.success(`Duplicated ${n} item${n > 1 ? 's' : ''}`);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-white/85 hover:bg-white/10 hover:text-white"
        >
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Duplicate</span>
        </button>
        <button
          type="button"
          onClick={() => onDelete(selectedIds)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-red-300 hover:bg-red-500/15 hover:text-red-200"
        >
          <Trash className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </button>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <button type="button" onClick={onClear} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Clear selection">
          <X className="h-4 w-4" />
        </button>
      </div>

      {(['status', 'contentPillar', 'owner'] as const).map((f) => (
        <Popover key={f} open={open === f} anchor={refs[f].current} onClose={() => setOpen(null)} width={220}>
          <OptionList
            options={options[f]}
            selected={[]}
            onSelect={(v) => apply(f, v, f === 'contentPillar' ? 'Pillar' : f === 'owner' ? 'PIC' : 'Status')}
          />
        </Popover>
      ))}
      <Popover open={open === 'shift'} anchor={refs.shift.current} onClose={() => setOpen(null)} width={200}>
        <OptionList
          options={[
            { value: '-7', label: '1 week earlier' },
            { value: '-1', label: '1 day earlier' },
            { value: '1', label: '1 day later' },
            { value: '7', label: '1 week later' },
          ]}
          selected={[]}
          onSelect={(v) => shiftDates(Number(v))}
        />
      </Popover>
    </div>,
    document.body,
  );
}
