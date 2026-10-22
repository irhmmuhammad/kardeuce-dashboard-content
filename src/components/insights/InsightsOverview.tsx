import { useMemo, useState, type ReactNode } from 'react';
import { ChartNoAxesCombined, Eye, Gauge, Heart, RefreshCw, UserRound, Users } from 'lucide-react';
import type { SocialPlatform } from '@shared/insights';
import { useInsights } from '@/store/insights';
import { useWorkspace } from '@/store/workspace';
import { useInsightsData } from '@/hooks/useInsightsData';
import { ER_FORMULA } from '@/lib/analytics';
import {
  bestTimeGrid,
  dailySeries,
  fmtMetric,
  generateInsights,
  groupBy,
  GROUP_METRIC_LABEL,
  pctDelta,
  trendRows,
  type AccountKpis,
  type GroupMetric,
  type PostRow,
} from '@/lib/insights';
import { cn, formatNumber } from '@/lib/utils';
import { PLATFORM_COLORS } from '@/config/theme';
import { KpiCard } from '@/components/ui/KpiCard';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { InsightsToolbar, SyncStatusBanner } from './InsightsToolbar';
import { BestTimeHeatmap, GroupedPlatformBars, PlatformLegend, PlatformLineChart } from './Charts';
import { InsightList, TopContentList } from './PostPieces';

export function Panel({ title, action, children, className, subtitle }: { title: string; action?: ReactNode; children: ReactNode; className?: string; subtitle?: ReactNode }) {
  return (
    <section className={cn('card min-w-0 p-4 sm:p-5', className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[11.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-4">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const short = (p: SocialPlatform) => (p === 'Instagram' ? 'IG' : 'TT');

/** "IG 2.6k · TT 2.4k" under combined KPI values. */
function split(kpisBy: Partial<Record<SocialPlatform, AccountKpis>>, platforms: SocialPlatform[], key: keyof AccountKpis, kind?: 'pct'): string | undefined {
  if (platforms.length < 2) return undefined;
  return platforms.map((p) => `${short(p)} ${fmtMetric(kpisBy[p]?.[key] as number | undefined, kind)}`).join(' · ');
}

export function useAccountKpiCards() {
  const d = useInsightsData();
  const { kpis, prevKpis, kpisBy, platforms, period, snapshots, loading } = d;
  const color = platforms.length === 1 ? PLATFORM_COLORS[platforms[0]] : undefined;
  const series = (key: Parameters<typeof dailySeries>[3]) => dailySeries(snapshots, platforms, period, key);
  const net = kpis.netFollowers;
  const cards = [
    {
      label: 'Followers',
      icon: <Users className="h-3.5 w-3.5" />,
      value: fmtMetric(kpis.followers),
      delta: pctDelta(kpis.followers, prevKpis.followers),
      hint: [net !== undefined ? `${net >= 0 ? '+' : ''}${formatNumber(net)} net` : null, split(kpisBy, platforms, 'followers')].filter(Boolean).join(' · ') || undefined,
      sparkline: series('followers'),
      info: 'Followers at the end of the period. Instagram only reports today’s count, so earlier days are rebuilt from daily follows minus unfollows.',
    },
    {
      label: 'Reach',
      icon: <Users className="h-3.5 w-3.5" />,
      value: fmtMetric(kpis.reach),
      delta: pctDelta(kpis.reach, prevKpis.reach),
      hint: split(kpisBy, platforms, 'reach'),
      sparkline: series('reach'),
      info: 'Sum of daily reach (accounts that saw your content each day). TikTok reach needs Advanced Access.',
    },
    {
      label: 'Views',
      icon: <Eye className="h-3.5 w-3.5" />,
      value: fmtMetric(kpis.views),
      delta: pctDelta(kpis.views, prevKpis.views),
      hint: split(kpisBy, platforms, 'views'),
      sparkline: series('views'),
    },
    {
      label: 'Engagement rate',
      icon: <Gauge className="h-3.5 w-3.5" />,
      value: fmtMetric(kpis.er, 'pct'),
      delta: pctDelta(kpis.er, prevKpis.er),
      hint: split(kpisBy, platforms, 'er', 'pct'),
      sparkline: series('er'),
      info: ER_FORMULA,
      accent: true,
    },
    {
      label: 'Total interactions',
      icon: <Heart className="h-3.5 w-3.5" />,
      value: fmtMetric(kpis.interactions),
      delta: pctDelta(kpis.interactions, prevKpis.interactions),
      hint: split(kpisBy, platforms, 'interactions'),
      sparkline: series('interactions'),
      info: 'Likes + comments + shares + saves (TikTok account totals have no favorites).',
    },
    {
      label: 'Profile visits',
      icon: <UserRound className="h-3.5 w-3.5" />,
      value: fmtMetric(kpis.profileVisits),
      delta: pctDelta(kpis.profileVisits, prevKpis.profileVisits),
      hint: split(kpisBy, platforms, 'profileVisits'),
      sparkline: series('profileVisits'),
      info: 'How often the profile was opened. Older Instagram days fill in over the next few refreshes.',
    },
  ];
  return { cards, color, loading, data: d };
}

export function AccountKpiGrid() {
  const { cards, color, loading } = useAccountKpiCards();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <KpiCard key={c.label} label={c.label} icon={c.icon} value={c.value} delta={c.delta} hint={c.hint} sparkline={c.sparkline} sparklineColor={c.accent ? undefined : color} info={c.info} accent={c.accent} loading={loading} />
      ))}
    </div>
  );
}

export function FollowersPanel({ className }: { className?: string }) {
  const { snapshots, platforms, period } = useInsightsData();
  const [mode, setMode] = useState<'total' | 'net'>('total');
  const rows = useMemo(() => trendRows(snapshots, platforms, period, mode === 'total' ? 'followers' : 'netFollowers'), [snapshots, platforms, period, mode]);
  return (
    <Panel
      title="Followers growth"
      subtitle={mode === 'net' ? (period.days > 35 ? 'Net new followers per week' : 'Net new followers per day') : 'Total followers'}
      className={className}
      action={
        <div className="flex items-center gap-3">
          <PlatformLegend platforms={platforms} />
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'total', label: 'Total' },
              { value: 'net', label: 'Net growth' },
            ]}
          />
        </div>
      }
    >
      <PlatformLineChart rows={rows} platforms={platforms} format={(v) => fmtMetric(v)} height={240} />
    </Panel>
  );
}

export function TrendPanels() {
  const { snapshots, platforms, period } = useInsightsData();
  const reach = useMemo(() => trendRows(snapshots, platforms, period, 'reach'), [snapshots, platforms, period]);
  const er = useMemo(() => trendRows(snapshots, platforms, period, 'er'), [snapshots, platforms, period]);
  const unit = period.days > 35 ? 'per week' : 'per day';
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Reach trend" subtitle={`Accounts reached ${unit}`} action={<PlatformLegend platforms={platforms} />}>
        <PlatformLineChart rows={reach} platforms={platforms} format={(v) => fmtMetric(v)} height={200} />
      </Panel>
      <Panel title="Engagement rate trend" subtitle={`Interactions ÷ reach ${unit}`} action={<PlatformLegend platforms={platforms} />}>
        <PlatformLineChart rows={er} platforms={platforms} format={(v) => `${v.toFixed(1)}%`} height={200} yDomain={[0, 'auto']} />
      </Panel>
    </div>
  );
}

const METRIC_OPTIONS = (['er', 'saves', 'shares', 'reach'] as GroupMetric[]).map((m) => ({ value: m, label: GROUP_METRIC_LABEL[m].replace('Avg. ', '') }));

export function BreakdownPanels() {
  const { rows, platforms } = useInsightsData();
  const pillars = useWorkspace((s) => s.pillars);
  const types = useWorkspace((s) => s.settings.contentTypes);
  const [metric, setMetric] = useState<GroupMetric>('er');
  const fmt = (v: number) => (metric === 'er' ? `${v.toFixed(1)}%` : fmtMetric(v));
  const byPillar = useMemo(() => groupBy(rows, (r) => r.pillar, metric, pillars.map((p) => p.name)), [rows, metric, pillars]);
  const byFormat = useMemo(() => groupBy(rows, (r) => r.format, metric, types), [rows, metric, types]);
  const empty = <p className="py-10 text-center text-[12.5px] text-ink-4">No posts in this period.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel
        title={`${GROUP_METRIC_LABEL[metric]} by content pillar`}
        subtitle="Unlinked posts are grouped until linked to a plan item"
        action={<Segmented size="sm" value={metric} onChange={setMetric} options={METRIC_OPTIONS} />}
      >
        {byPillar.length ? <GroupedPlatformBars rows={byPillar} platforms={platforms} format={fmt} /> : empty}
        <PlatformLegend platforms={platforms} className="mt-2" />
      </Panel>
      <Panel title={`${GROUP_METRIC_LABEL[metric]} by format`} subtitle="Per platform, same metric as the pillar chart">
        {byFormat.length ? <GroupedPlatformBars rows={byFormat} platforms={platforms} format={fmt} /> : empty}
        <PlatformLegend platforms={platforms} className="mt-2" />
      </Panel>
    </div>
  );
}

type TopSort = 'er' | 'views' | 'saves' | 'shares';

export function sortRows(rows: PostRow[], key: TopSort): PostRow[] {
  const val = (r: PostRow) => (key === 'er' ? r.er : r.metrics[key]) ?? -1;
  return rows.slice().sort((a, b) => val(b) - val(a));
}

export function InsightsOverview() {
  const d = useInsightsData();
  const syncNow = useInsights((s) => s.syncNow);
  const [topSort, setTopSort] = useState<TopSort>('er');
  const insights = useMemo(
    () => generateInsights({ rows: d.rows, kpis: d.kpisBy, prevKpis: d.prevKpisBy, period: d.period, platforms: d.platforms }),
    [d.rows, d.kpisBy, d.prevKpisBy, d.period, d.platforms],
  );
  const heat = useMemo(() => bestTimeGrid(d.rows), [d.rows]);
  const top = useMemo(() => sortRows(d.rows, topSort), [d.rows, topSort]);

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <InsightsToolbar period={d.period} />
      </div>
      <SyncStatusBanner platforms={d.platforms} />
      <AccountKpiGrid />

      {d.loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Skeleton className="h-72 lg:col-span-7" />
          <Skeleton className="h-72 lg:col-span-5" />
          <Skeleton className="h-56 lg:col-span-6" />
          <Skeleton className="h-56 lg:col-span-6" />
        </div>
      ) : !d.hasAnyData ? (
        <div className="card">
          <EmptyState
            icon={<ChartNoAxesCombined className="h-5 w-5" />}
            title="No insights yet"
            description="Sync to pull account and post insights (demo data is used until Instagram or TikTok is connected)."
            action={
              <Button variant="primary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => syncNow()}>
                Sync now
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <FollowersPanel className="lg:col-span-7" />
            <Panel title="Insights" subtitle={`Auto-generated · ${d.period.label}`} className="lg:col-span-5">
              <InsightList insights={insights} />
            </Panel>
          </div>
          <TrendPanels />
          <BreakdownPanels />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Panel title="Best time to post" subtitle={`Avg. ER by day and hour vs your average (${d.rows.filter((r) => r.hour !== null).length} posts, your local time)`} className="lg:col-span-5">
              <BestTimeHeatmap cells={heat.cells} />
            </Panel>
            <Panel
              title="Top content"
              subtitle="Instagram & TikTok together. Click to open."
              className="lg:col-span-7"
              action={
                <Segmented
                  size="sm"
                  value={topSort}
                  onChange={setTopSort}
                  options={[
                    { value: 'er', label: 'ER' },
                    { value: 'views', label: 'Views' },
                    { value: 'saves', label: 'Saves' },
                    { value: 'shares', label: 'Shares' },
                  ]}
                />
              }
            >
              <TopContentList rows={top} limit={7} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
