import { useMemo } from 'react';
import { ArrowRight, CalendarClock, CircleCheck, Gauge, Hammer, Layers, Lightbulb, Plus, Send, Sparkles } from 'lucide-react';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useMonthPlan } from '@/hooks/useMonthContents';
import { navigate } from '@/hooks/useRoute';
import { addMonths, formatShort, monthLabel, monthName, relativeDay, todayISO, weekdayShort } from '@/lib/date';
import { contentER, hasMetrics, inMonth, stageOf, type DistributionRow } from '@/lib/analytics';
import { cn, formatPct } from '@/lib/utils';
import { TONES } from '@/config/theme';
import { PageHeader } from '@/components/layout/PageHeader';
import { MonthNavigator } from '@/components/ui/MonthNavigator';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { DonutChart } from '@/components/charts/DonutChart';
import { DistributionBars } from '@/components/charts/DistributionBars';
import { PillarBadge, StatusBadge, TypeBadge, typeIcon } from '@/components/badges/Badges';
import { PlatformIcons } from '@/components/badges/PlatformIcon';
import { ContentHealthCard } from '@/components/content/ContentHealthCard';
import { InsightChip } from '@/components/content/PlanInsights';
import { InsightsOverview } from '@/components/insights/InsightsOverview';
import type { StatusStage } from '@/types';

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('card p-4 sm:p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[11.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DashboardPage() {
  const month = useUI((s) => s.month);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const openContent = useUI((s) => s.openContent);
  const setFilters = useUI((s) => s.setFilters);
  const clearFilters = useUI((s) => s.clearFilters);
  const contents = useWorkspace((s) => s.contents);
  const statuses = useWorkspace((s) => s.settings.statuses);
  const team = useWorkspace((s) => s.settings.team);
  const ideas = useWorkspace((s) => s.ideas);
  const { items, insights, health } = useMonthPlan(month);
  const today = todayISO();

  const stats = useMemo(() => {
    const byStage = (stage: StatusStage) => items.filter((c) => stageOf(c.status, statuses) === stage).length;
    const published = items.filter((c) => stageOf(c.status, statuses) === 'published' && hasMetrics(c));
    const er = published.length ? published.reduce((s, c) => s + (contentER(c) ?? 0), 0) / published.length : null;
    const prevMonth = addMonths(month, -1);
    const prev = contents.filter((c) => inMonth(c, prevMonth));
    const prevPublished = prev.filter((c) => stageOf(c.status, statuses) === 'published' && hasMetrics(c));
    const prevEr = prevPublished.length ? prevPublished.reduce((s, c) => s + (contentER(c) ?? 0), 0) / prevPublished.length : null;
    return {
      total: items.length,
      prevTotal: prev.length,
      published: byStage('published'),
      progress: byStage('progress'),
      idea: byStage('idea'),
      scheduled: byStage('scheduled'),
      er,
      prevEr,
    };
  }, [items, contents, statuses, month]);

  const upcoming = useMemo(
    () =>
      contents
        .filter((c) => c.publishDate && c.publishDate >= today && stageOf(c.status, statuses) !== 'published')
        .sort((a, b) => a.publishDate.localeCompare(b.publishDate))
        .slice(0, 6),
    [contents, statuses, today],
  );

  const pipeline = statuses.map((s) => ({ ...s, count: items.filter((c) => c.status === s.name).length }));
  const workload = team
    .map((m) => ({ member: m, count: items.filter((c) => c.owner === m.id).length, done: items.filter((c) => c.owner === m.id && stageOf(c.status, statuses) === 'published').length }))
    .sort((a, b) => b.count - a.count);
  const maxLoad = Math.max(1, ...workload.map((w) => w.count));

  const goPlan = (statusNames?: string[]) => {
    clearFilters();
    if (statusNames) setFilters({ statuses: statusNames });
    navigate('plan');
  };
  const namesForStage = (stage: StatusStage) => statuses.filter((s) => s.stage === stage).map((s) => s.name);

  const pillarData = insights.pillars.map((p: DistributionRow) => ({ name: p.name, value: p.count, color: p.color ?? '#9aa29c' }));
  const delta = stats.prevTotal ? ((stats.total - stats.prevTotal) / stats.prevTotal) * 100 : null;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Content Dashboard"
        subtitle="How KARDEUCE is performing on Instagram & TikTok, and what’s next in the plan."
        actions={
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />} onClick={() => openQuickAdd()}>
            Add Content
          </Button>
        }
      />

      <InsightsOverview />

      {/* Planning */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-6">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Planning</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Content plan for {monthLabel(month)}: mix, health and what’s coming up.</p>
        </div>
        <MonthNavigator />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Content" value={stats.total} icon={<Layers className="h-3.5 w-3.5" />} delta={delta} hint={`vs ${monthName(addMonths(month, -1))}: ${stats.prevTotal}`} onClick={() => goPlan()} />
        <KpiCard label="Published" value={stats.published} icon={<CircleCheck className="h-3.5 w-3.5" />} hint={`${stats.total ? Math.round((stats.published / stats.total) * 100) : 0}% of plan`} onClick={() => goPlan(namesForStage('published'))} />
        <KpiCard label="In Progress" value={stats.progress} icon={<Hammer className="h-3.5 w-3.5" />} hint="Brief → Ready to Post" onClick={() => goPlan(namesForStage('progress'))} />
        <KpiCard label="Ideation" value={stats.idea} icon={<Lightbulb className="h-3.5 w-3.5" />} hint={`${ideas.filter((i) => !i.movedToContentId).length} ideas in bank`} onClick={() => goPlan(namesForStage('idea'))} />
        <KpiCard label="Scheduled" value={stats.scheduled} icon={<Send className="h-3.5 w-3.5" />} hint="Queued to publish" onClick={() => goPlan(namesForStage('scheduled'))} />
        <KpiCard
          label="Plan ER"
          value={stats.er !== null ? formatPct(stats.er) : '—'}
          icon={<Gauge className="h-3.5 w-3.5" />}
          delta={stats.er !== null && stats.prevEr ? ((stats.er - stats.prevEr) / stats.prevEr) * 100 : null}
          hint={stats.er !== null ? 'avg. per published post' : stats.prevEr !== null ? `No data yet · ${monthName(addMonths(month, -1))} ${formatPct(stats.prevEr)}` : 'No published content yet'}
          onClick={() => navigate('performance')}
        />
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title={`No content planned for ${monthName(month)} yet.`}
            description="Start building your content calendar by adding your first content idea."
            action={
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openQuickAdd()}>
                Add Content
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Panel title="Content Pillar Distribution" className="lg:col-span-5" action={<span className="text-[11.5px] text-ink-4">{monthLabel(month)}</span>}>
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <DonutChart data={pillarData} centerValue={String(insights.total)} centerLabel="planned posts" />
                <div className="w-full min-w-0 flex-1">
                  <DistributionBars rows={insights.pillars} showRecommended compact />
                  <p className="mt-3 text-[11px] text-ink-4">Tick marks show the recommended mix from Content Strategy.</p>
                </div>
              </div>
            </Panel>
            <Panel title="Content Format Distribution" className="lg:col-span-4">
              <DistributionBars
                rows={insights.formats}
                icon={(name) => {
                  const Icon = typeIcon(name);
                  return (
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-3 w-3 text-ink-2" />
                    </span>
                  );
                }}
              />
            </Panel>
            <ContentHealthCard health={health} className="lg:col-span-3" />
          </div>

          {insights.insights.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {insights.insights.map((i) => (
                <InsightChip key={i.id} insight={i} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Panel
              title="Upcoming Content"
              className="lg:col-span-7"
              action={
                <button type="button" onClick={() => goPlan()} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink">
                  Open plan <ArrowRight className="h-3 w-3" />
                </button>
              }
            >
              {upcoming.length === 0 ? (
                <EmptyState compact icon={<CalendarClock className="h-5 w-5" />} title="Nothing upcoming" description="All planned content has been published. Time to plan the next batch!" />
              ) : (
                <div className="-mx-2 divide-y divide-line">
                  {upcoming.map((c) => {
                    const owner = team.find((t) => t.id === c.owner);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openContent(c.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover"
                      >
                        <div className={cn('flex w-12 shrink-0 flex-col items-center rounded-lg py-1', c.publishDate === today ? 'bg-ink text-brand' : 'bg-muted text-ink')}>
                          <span className="text-[15px] leading-tight font-bold tabular">{formatShort(c.publishDate).split(' ')[0]}</span>
                          <span className="text-[10px] font-medium uppercase opacity-70">{formatShort(c.publishDate).split(' ')[1]}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-semibold text-ink">{c.title}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-3">
                            <span>{weekdayShort(c.publishDate)}</span>·<span>{relativeDay(c.publishDate)}</span>
                            <PlatformIcons platforms={c.platform} className="hidden sm:inline-flex" />
                          </div>
                        </div>
                        <div className="hidden items-center gap-1.5 md:flex">
                          <TypeBadge type={c.contentType} />
                          <PillarBadge pillar={c.contentPillar} />
                        </div>
                        <StatusBadge status={c.status} className="hidden sm:inline-flex" />
                        {owner && <Avatar member={owner} size={24} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </Panel>

            <div className="space-y-4 lg:col-span-5">
              <Panel title="Production Pipeline">
                <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
                  {pipeline
                    .filter((p) => p.count > 0)
                    .map((p) => (
                      <div key={p.name} className={cn('h-full first:rounded-l-full last:rounded-r-full', TONES[p.tone].dot)} style={{ width: `${(p.count / Math.max(1, items.length)) * 100}%` }} title={`${p.name}: ${p.count}`} />
                    ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {pipeline.map((p) => (
                    <button key={p.name} type="button" onClick={() => goPlan([p.name])} className="flex items-center gap-2 rounded-md py-0.5 text-left text-[12.5px] hover:text-ink">
                      <span className={cn('h-2 w-2 rounded-full', TONES[p.tone].dot)} />
                      <span className="flex-1 text-ink-2">{p.name}</span>
                      <span className={cn('font-semibold tabular', p.count ? 'text-ink' : 'text-ink-4')}>{p.count}</span>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel title="Team Workload">
                <div className="space-y-2.5">
                  {workload.map(({ member, count, done }) => (
                    <div key={member.id} className="flex items-center gap-2.5">
                      <Avatar member={member} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between text-[12.5px]">
                          <span className="truncate font-medium text-ink">{member.name}</span>
                          <span className="text-ink-3 tabular">
                            {count} content{done ? ` · ${done} live` : ''}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-ink-2" style={{ width: `${(count / maxLoad) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
