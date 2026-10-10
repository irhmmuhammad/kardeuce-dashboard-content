import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Lightbulb, Plus } from 'lucide-react';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useFilteredContents } from '@/hooks/useMonthContents';
import { addDays, formatShort, monthKeyOf, startOfWeek, todayISO, isoWeekNumber } from '@/lib/date';
import { PageHeader } from '@/components/layout/PageHeader';
import { MonthNavigator } from '@/components/ui/MonthNavigator';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/content/FilterBar';
import { CalendarView, DND_CONTENT, DND_IDEA } from '@/components/content/CalendarView';
import { PillarBadge, PriorityBadge, TypeBadge } from '@/components/badges/Badges';

export function CalendarPage() {
  const month = useUI((s) => s.month);
  const mode = useUI((s) => s.calendarMode);
  const setMode = useUI((s) => s.setCalendarMode);
  const weekAnchor = useUI((s) => s.weekAnchor);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const openContent = useUI((s) => s.openContent);
  const pillars = useWorkspace((s) => s.pillars);
  const ideas = useWorkspace((s) => s.ideas);
  const { items } = useFilteredContents(month);

  const anchor = weekAnchor ?? (monthKeyOf(todayISO()) === month ? todayISO() : `${month}-01`);
  const goWeek = (delta: number) => {
    const next = addDays(startOfWeek(anchor), delta);
    useUI.setState({ month: monthKeyOf(next), weekAnchor: next });
  };

  const unscheduled = items.filter((c) => !c.publishDate);
  const openIdeas = useMemo(
    () => ideas.filter((i) => !i.movedToContentId).sort((a, b) => ['High', 'Medium', 'Low'].indexOf(a.priority) - ['High', 'Medium', 'Low'].indexOf(b.priority)),
    [ideas],
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Calendar"
        subtitle="Drag content between dates, drop ideas from the bank onto a day, or click an empty day to create content."
        actions={
          <>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
              ]}
            />
            <MonthNavigator />
            <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />} onClick={() => openQuickAdd()}>
              Add Content
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar />
        <div className="flex flex-wrap items-center gap-3">
          {pillars.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </div>

      {mode === 'week' && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={() => goWeek(-7)}>
            Prev
          </Button>
          <span className="text-[13px] font-semibold text-ink tabular">
            Week {isoWeekNumber(anchor)} · {formatShort(startOfWeek(anchor))} – {formatShort(addDays(startOfWeek(anchor), 6))}
          </span>
          <Button size="sm" variant="secondary" iconRight={<ChevronRight className="h-3.5 w-3.5" />} onClick={() => goWeek(7)}>
            Next
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
        <div className="scrollbar-thin overflow-x-auto">
          <CalendarView items={items} month={month} mode={mode} weekAnchor={anchor} className="min-w-[760px]" />
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-1 text-[11.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Unscheduled</h2>
            <p className="mb-3 text-[11.5px] text-ink-4">Content without a publish date. Drag onto a day.</p>
            {unscheduled.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-center text-[12px] text-ink-4">Everything has a date 🎾</p>
            ) : (
              <div className="space-y-1.5">
                {unscheduled.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(DND_CONTENT, c.id)}
                    onClick={() => openContent(c.id)}
                    className="flex cursor-grab items-center gap-2 rounded-lg border border-line bg-white px-2 py-1.5 hover:border-line-strong"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-ink-4" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{c.title || 'Untitled'}</span>
                    <PillarBadge pillar={c.contentPillar} size="xs" />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
              <Lightbulb className="h-3.5 w-3.5" /> From Content Bank
            </h2>
            <p className="mb-3 text-[11.5px] text-ink-4">Drop an idea on a date to move it into the plan.</p>
            <div className="scrollbar-thin max-h-[420px] space-y-1.5 overflow-y-auto">
              {openIdeas.map((i) => (
                <div
                  key={i.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DND_IDEA, i.id)}
                  className="cursor-grab rounded-lg border border-line bg-white px-2.5 py-2 hover:border-line-strong active:cursor-grabbing"
                >
                  <div className="flex items-start gap-1.5">
                    <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4" />
                    <span className="min-w-0 flex-1 text-[12.5px] leading-snug font-medium text-ink">{i.idea}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5">
                    <PriorityBadge priority={i.priority} />
                    <PillarBadge pillar={i.contentPillar} size="xs" />
                    <TypeBadge type={i.contentType} iconOnly />
                  </div>
                </div>
              ))}
              {openIdeas.length === 0 && <p className="text-[12px] text-ink-4">No open ideas. Add some in Content Bank.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
