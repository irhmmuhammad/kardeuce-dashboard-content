import { useState } from 'react';
import { CalendarDays, Download, FunnelX, Kanban, Menu as MenuIcon, Plus, Table2, Upload } from 'lucide-react';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { useFilteredContents } from '@/hooks/useMonthContents';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { contentsToCsv, downloadFile } from '@/lib/csv';
import { addDays, monthKeyOf, monthName, startOfWeek, todayISO } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { MonthNavigator } from '@/components/ui/MonthNavigator';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tooltip } from '@/components/ui/Tooltip';
import { FilterBar } from '@/components/content/FilterBar';
import { SortMenu, ViewOptions } from '@/components/content/ViewOptions';
import { PlanInsights } from '@/components/content/PlanInsights';
import { ContentTable } from '@/components/content/ContentTable';
import { ContentCardList } from '@/components/content/ContentCardList';
import { CalendarView } from '@/components/content/CalendarView';
import { KanbanBoard } from '@/components/content/KanbanBoard';
import { ImportModal } from '@/components/content/ImportModal';
import type { PlanView } from '@/types';

export function ContentPlanPage() {
  const month = useUI((s) => s.month);
  const view = useUI((s) => s.planView);
  const setView = useUI((s) => s.setPlanView);
  const clearFilters = useUI((s) => s.clearFilters);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const calendarMode = useUI((s) => s.calendarMode);
  const setCalendarMode = useUI((s) => s.setCalendarMode);
  const weekAnchor = useUI((s) => s.weekAnchor);
  const setMobileOpen = useUI((s) => s.setMobileNavOpen);
  const platforms = useWorkspace((s) => s.settings.platforms);
  const team = useWorkspace((s) => s.settings.team);
  const isMobile = useIsMobile();
  const [importOpen, setImportOpen] = useState(false);

  const { items, totalInMonth } = useFilteredContents(month);
  const title = `Content Plan ${[...platforms].reverse().join(' & ')}`;

  const anchor = weekAnchor ?? (monthKeyOf(todayISO()) === month ? todayISO() : `${month}-01`);
  const goWeek = (delta: number) => {
    const next = addDays(startOfWeek(anchor), delta);
    useUI.setState({ month: monthKeyOf(next), weekAnchor: next });
  };

  const exportCsv = () => {
    if (!items.length) {
      toast.info('Nothing to export', 'There’s no content in the current view.');
      return;
    }
    downloadFile(`kardeuce-content-plan-${month}.csv`, contentsToCsv(items, team));
    toast.success('CSV exported', `${items.length} rows · kardeuce-content-plan-${month}.csv`);
  };

  const empty = totalInMonth === 0;
  const filteredOut = !empty && items.length === 0;

  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-4 pb-4 lg:px-6 lg:pt-5">
      {/* Title row: Month (left) · centred title · view switch (right) */}
      <header className="grid shrink-0 grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg border border-line bg-white p-2 text-ink md:hidden" aria-label="Open menu">
            <MenuIcon className="h-4 w-4" />
          </button>
          <span className="hidden text-[12px] font-semibold tracking-wide text-ink-3 uppercase sm:inline">Month:</span>
          <span className="hidden text-[15px] font-bold text-ink 2xl:inline">{monthName(month)}</span>
          <MonthNavigator />
        </div>
        <h1 className="order-first text-center text-[15px] font-extrabold tracking-[0.12em] whitespace-nowrap text-ink uppercase sm:text-[16px] xl:order-none">{title}</h1>
        <div className="flex items-center justify-center gap-2 xl:justify-end">
          <Segmented<PlanView>
            value={view}
            onChange={setView}
            options={[
              { value: 'table', label: 'Table', icon: <Table2 className="h-3.5 w-3.5" /> },
              { value: 'calendar', label: 'Calendar', icon: <CalendarDays className="h-3.5 w-3.5" /> },
              { value: 'kanban', label: 'Kanban', icon: <Kanban className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>
      </header>

      {/* Controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <FilterBar className="min-w-0 flex-1" />
        <div className="flex flex-wrap items-center gap-1.5">
          {view === 'table' && !isMobile && <SortMenu />}
          {view === 'table' && !isMobile && <ViewOptions />}
          {view === 'calendar' && (
            <Segmented
              size="sm"
              value={calendarMode}
              onChange={setCalendarMode}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
              ]}
            />
          )}
          <Tooltip content="Import CSV">
            <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => setImportOpen(true)}>
              <span className="hidden 2xl:inline">Import</span>
            </Button>
          </Tooltip>
          <Tooltip content="Export current view as CSV">
            <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv}>
              <span className="hidden 2xl:inline">Export CSV</span>
            </Button>
          </Tooltip>
          <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />} onClick={() => openQuickAdd()}>
            Add Content
          </Button>
        </div>
      </div>

      <div className="shrink-0">
        <PlanInsights month={month} />
      </div>

      {/* Main view */}
      <div className="min-h-[440px] flex-1">
        {empty ? (
          <div className="card flex h-full items-center justify-center">
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title={`No content planned for ${monthName(month)} yet.`}
              description="Start building your content calendar by adding your first content idea."
              action={
                <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openQuickAdd()}>
                  Add Content
                </Button>
              }
            />
          </div>
        ) : filteredOut && view !== 'calendar' ? (
          <div className="card flex h-full items-center justify-center">
            <EmptyState
              icon={<FunnelX className="h-5 w-5" />}
              title="No content matches your filters"
              description={`${totalInMonth} item${totalInMonth === 1 ? '' : 's'} in ${monthName(month)} are hidden by the current search or filters.`}
              action={<Button onClick={clearFilters}>Clear Filters</Button>}
            />
          </div>
        ) : view === 'table' ? (
          isMobile ? (
            <ContentCardList items={items} />
          ) : (
            <ContentTable items={items} month={month} />
          )
        ) : view === 'calendar' ? (
          <div className="flex h-full flex-col gap-2">
            {calendarMode === 'week' && (
              <div className="flex items-center gap-2">
                <Button size="xs" onClick={() => goWeek(-7)}>
                  ← Prev week
                </Button>
                <Button size="xs" onClick={() => goWeek(7)}>
                  Next week →
                </Button>
              </div>
            )}
            <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
              <CalendarView items={items} month={month} mode={calendarMode} weekAnchor={anchor} className="min-w-[760px]" />
            </div>
          </div>
        ) : (
          <KanbanBoard items={items} />
        )}
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
