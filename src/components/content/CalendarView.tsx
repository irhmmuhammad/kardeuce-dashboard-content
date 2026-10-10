import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ContentItem, ISODate, MonthKey } from '@/types';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { WEEKDAY_LABELS, formatShort, monthGrid, monthKeyOf, todayISO, weekDays, parseISO } from '@/lib/date';
import { cn } from '@/lib/utils';
import { alpha } from '@/config/theme';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import { PillarBadge, StatusBadge, StatusDot, typeIcon } from '@/components/badges/Badges';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';

export const DND_CONTENT = 'application/x-kardeuce-content';
export const DND_IDEA = 'application/x-kardeuce-idea';

interface CalendarViewProps {
  items: ContentItem[];
  month: MonthKey;
  mode: 'month' | 'week';
  weekAnchor: ISODate;
  className?: string;
}

function CalendarCard({ item, detailed }: { item: ContentItem; detailed?: boolean }) {
  const openContent = useUI((s) => s.openContent);
  const pillar = useWorkspace((s) => s.pillars.find((p) => p.name === item.contentPillar));
  const owner = useWorkspace((s) => s.settings.team.find((t) => t.id === item.owner));
  const color = pillar?.color ?? '#9aa29c';
  const TypeIcon = typeIcon(item.contentType);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_CONTENT, item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.stopPropagation();
        openContent(item.id);
      }}
      className="group/card cursor-pointer rounded-lg border bg-white px-2 py-1.5 text-left transition-shadow hover:shadow-[0_2px_8px_rgb(23_33_26/0.1)] active:cursor-grabbing"
      style={{ borderColor: alpha(color, 0.35), background: alpha(color, 0.07), borderLeft: `3px solid ${color}` }}
    >
      {detailed && item.coverImage && <img src={item.coverImage} alt="" className="mb-1.5 aspect-[4/5] w-full rounded-md object-cover" />}
      <div className="flex items-start gap-1">
        <span className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-snug font-semibold text-ink">{item.title || 'Untitled'}</span>
        {!detailed && <StatusDot status={item.status} className="mt-1" />}
      </div>
      <div className="mt-1 flex items-center gap-1 text-ink-3">
        {item.platform.map((p) => (
          <PlatformIcon key={p} platform={p} className="h-3 w-3" />
        ))}
        <span className="mx-0.5 h-3 w-px bg-ink/10" />
        <TypeIcon className="h-3 w-3" />
        <span className="truncate text-[10.5px] font-medium">{item.contentType}</span>
        {detailed && owner && <Avatar member={owner} size={16} className="ml-auto" />}
      </div>
      {detailed && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <PillarBadge pillar={item.contentPillar} size="xs" />
          <StatusBadge status={item.status} size="xs" />
        </div>
      )}
    </div>
  );
}

export function CalendarView({ items, month, mode, weekAnchor, className }: CalendarViewProps) {
  const updateContent = useWorkspace((s) => s.updateContent);
  const moveIdeaToPlan = useWorkspace((s) => s.moveIdeaToPlan);
  const ideas = useWorkspace((s) => s.ideas);
  const platforms = useWorkspace((s) => s.settings.platforms);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const [over, setOver] = useState<string | null>(null);
  const today = todayISO();

  const days = mode === 'month' ? monthGrid(month) : weekDays(weekAnchor);
  const byDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    items.forEach((c) => {
      if (!c.publishDate) return;
      const list = map.get(c.publishDate) ?? [];
      list.push(c);
      map.set(c.publishDate, list);
    });
    return map;
  }, [items]);

  const onDrop = (date: ISODate, e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const contentId = e.dataTransfer.getData(DND_CONTENT);
    const ideaId = e.dataTransfer.getData(DND_IDEA);
    if (contentId) {
      const item = items.find((i) => i.id === contentId) ?? useWorkspace.getState().contents.find((c) => c.id === contentId);
      if (item && item.publishDate !== date) {
        const prev = item.publishDate;
        updateContent(contentId, { publishDate: date });
        toast.success(`Moved to ${formatShort(date)}`, item.title, prev ? { label: 'Undo', onClick: () => updateContent(contentId, { publishDate: prev }) } : undefined);
      }
    } else if (ideaId) {
      const idea = ideas.find((i) => i.id === ideaId);
      const created = moveIdeaToPlan(ideaId, { publishDate: date, platform: [...platforms] });
      if (created) toast.success('Idea moved to Content Plan', `“${idea?.idea}” scheduled for ${formatShort(date)}.`);
    }
  };

  return (
    <div className={cn('card flex flex-col overflow-hidden', className)}>
      <div className="grid grid-cols-7 border-b border-line bg-[#f3f5f0]">
        {(mode === 'month' ? WEEKDAY_LABELS : days).map((d, i) => (
          <div key={d} className={cn('px-2.5 py-2 text-[11.5px] font-semibold text-ink-3', i >= 5 && 'text-ink-4')}>
            {mode === 'month' ? (
              d
            ) : (
              <span className="flex items-baseline gap-1.5">
                {WEEKDAY_LABELS[i]}
                <span className={cn('text-[15px] font-bold', d === today ? 'text-ink' : 'text-ink-2')}>{parseISO(d).getDate()}</span>
                {d === today && <span className="rounded bg-brand px-1 text-[10px] font-semibold text-ink">Today</span>}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className={cn('grid flex-1 grid-cols-7', mode === 'month' ? 'auto-rows-[minmax(118px,1fr)]' : 'auto-rows-[minmax(460px,1fr)]')}>
        {days.map((date, i) => {
          const inMonth = monthKeyOf(date) === month;
          const list = byDate.get(date) ?? [];
          const isToday = date === today;
          const isWeekend = i % 7 >= 5;
          return (
            <div
              key={date}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (over !== date) setOver(date);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => onDrop(date, e)}
              onClick={() => openQuickAdd({ date })}
              className={cn(
                'group/day relative flex cursor-pointer flex-col gap-1 border-r border-b border-line p-1.5 transition-colors [&:nth-child(7n)]:border-r-0',
                !inMonth && mode === 'month' && 'bg-canvas/70',
                isWeekend && inMonth && 'bg-[#fbfcfa]',
                over === date && 'bg-brand-soft ring-2 ring-brand-strong ring-inset',
                'hover:bg-hover',
              )}
            >
              {mode === 'month' && (
                <div className="flex items-center justify-between px-0.5">
                  <span
                    className={cn(
                      'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold tabular',
                      isToday ? 'bg-ink text-brand' : inMonth ? 'text-ink' : 'text-ink-4',
                    )}
                  >
                    {parseISO(date).getDate()}
                  </span>
                  <Tooltip content={`Add content on ${formatShort(date)}`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openQuickAdd({ date });
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-ink-3 opacity-0 group-hover/day:opacity-100 hover:bg-white hover:text-ink"
                      aria-label="Add content"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </div>
              )}
              <div className="flex flex-col gap-1">
                {list.map((item) => (
                  <CalendarCard key={item.id} item={item} detailed={mode === 'week'} />
                ))}
              </div>
              {mode === 'week' && list.length === 0 && (
                <div className="flex flex-1 items-center justify-center text-[11.5px] text-ink-4 opacity-0 group-hover/day:opacity-100">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
