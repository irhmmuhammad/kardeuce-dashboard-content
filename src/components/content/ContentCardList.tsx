import type { ContentItem } from '@/types';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { parseISO, todayISO } from '@/lib/date';
import { cn, stripMarkdown } from '@/lib/utils';
import { PillarBadge, StatusBadge, TypeBadge } from '@/components/badges/Badges';
import { PlatformIcons } from '@/components/badges/PlatformIcon';
import { Avatar } from '@/components/ui/Avatar';

/** Mobile replacement for the spreadsheet: one card per content. */
export function ContentCardList({ items }: { items: ContentItem[] }) {
  const openContent = useUI((s) => s.openContent);
  const team = useWorkspace((s) => s.settings.team);
  const today = todayISO();
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const d = item.publishDate ? parseISO(item.publishDate) : null;
        const owner = team.find((t) => t.id === item.owner);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => openContent(item.id)}
            className="card flex w-full gap-3 p-3 text-left active:bg-hover"
          >
            <div
              className={cn(
                'flex w-12 shrink-0 flex-col items-center justify-center rounded-xl py-1.5',
                item.publishDate === today ? 'bg-ink text-brand' : 'bg-muted text-ink',
              )}
            >
              <span className="text-[10px] font-semibold uppercase opacity-70">{d ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : '—'}</span>
              <span className="text-[18px] leading-tight font-bold tabular">{d ? d.getDate() : '?'}</span>
              <span className="text-[10px] opacity-70">{d ? d.toLocaleDateString('en-GB', { month: 'short' }) : ''}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[14px] leading-snug font-semibold text-ink">{item.title || 'Untitled'}</span>
                {item.coverImage && <img src={item.coverImage} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
              </div>
              {item.brief && <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-3">{stripMarkdown(item.brief)}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={item.status} size="xs" />
                <PillarBadge pillar={item.contentPillar} size="xs" />
                <TypeBadge type={item.contentType} className="text-[11px]" />
                <span className="ml-auto flex items-center gap-1.5">
                  <PlatformIcons platforms={item.platform} />
                  {owner && <Avatar member={owner} size={20} />}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
