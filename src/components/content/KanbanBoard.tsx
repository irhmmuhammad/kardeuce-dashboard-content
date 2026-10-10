import { useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import type { ContentItem } from '@/types';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { TONES } from '@/config/theme';
import { formatShort, todayISO } from '@/lib/date';
import { stageOf } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { PillarBadge, TypeBadge } from '@/components/badges/Badges';
import { PlatformIcons } from '@/components/badges/PlatformIcon';
import { Avatar } from '@/components/ui/Avatar';
import { DND_CONTENT } from './CalendarView';

function KanbanCard({ item }: { item: ContentItem }) {
  const openContent = useUI((s) => s.openContent);
  const owner = useWorkspace((s) => s.settings.team.find((t) => t.id === item.owner));
  const statuses = useWorkspace((s) => s.settings.statuses);
  const overdue = !!item.publishDate && item.publishDate < todayISO() && stageOf(item.status, statuses) !== 'published';
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_CONTENT, item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => openContent(item.id)}
      className="group cursor-pointer rounded-xl border border-line bg-white p-3 transition-all hover:border-line-strong hover:shadow-[0_4px_14px_-4px_rgb(23_33_26/0.15)] active:cursor-grabbing"
    >
      {item.coverImage && <img src={item.coverImage} alt="" className="mb-2.5 aspect-video w-full rounded-lg object-cover" />}
      <div className="text-[13px] leading-snug font-semibold text-ink">{item.title || 'Untitled'}</div>
      {item.hook && <div className="mt-1 line-clamp-2 text-[11.5px] text-ink-3 italic">“{item.hook}”</div>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PillarBadge pillar={item.contentPillar} size="xs" />
        <TypeBadge type={item.contentType} className="text-[11px]" />
      </div>
      <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2">
        <span className={cn('inline-flex items-center gap-1 text-[11.5px] tabular', overdue ? 'font-semibold text-red-600' : 'text-ink-3')}>
          <CalendarDays className="h-3 w-3" />
          {item.publishDate ? formatShort(item.publishDate) : 'No date'}
        </span>
        <PlatformIcons platforms={item.platform} />
        <span className="ml-auto">{owner ? <Avatar member={owner} size={20} /> : null}</span>
      </div>
    </div>
  );
}

export function KanbanBoard({ items }: { items: ContentItem[] }) {
  const statuses = useWorkspace((s) => s.settings.statuses);
  const updateContent = useWorkspace((s) => s.updateContent);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="scrollbar-thin flex h-full gap-3 overflow-x-auto pb-2">
      {statuses.map((s) => {
        const list = items.filter((i) => i.status === s.name);
        const tone = TONES[s.tone];
        return (
          <div
            key={s.name}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== s.name) setOver(s.name);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData(DND_CONTENT);
              const item = items.find((i) => i.id === id);
              if (item && item.status !== s.name) {
                const prev = item.status;
                updateContent(id, { status: s.name });
                toast.success(`Moved to ${s.name}`, item.title, { label: 'Undo', onClick: () => updateContent(id, { status: prev }) });
              }
            }}
            className={cn(
              'flex w-[272px] shrink-0 flex-col rounded-[14px] border border-line bg-muted/50 transition-colors',
              over === s.name && 'border-brand-strong bg-brand-soft',
            )}
          >
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
              <span className="text-[12.5px] font-semibold text-ink">{s.name}</span>
              <span className="rounded-md bg-white px-1.5 text-[11px] font-medium text-ink-3 tabular ring-1 ring-line">{list.length}</span>
              <button
                type="button"
                onClick={() => openQuickAdd({ status: s.name })}
                className="ml-auto rounded-md p-1 text-ink-3 hover:bg-white hover:text-ink"
                aria-label={`Add content to ${s.name}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="scrollbar-thin flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {list.map((item) => (
                <KanbanCard key={item.id} item={item} />
              ))}
              {list.length === 0 && (
                <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-line-strong text-[11.5px] text-ink-4">Drop content here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
