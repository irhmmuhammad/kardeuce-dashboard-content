import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Columns3, Download, Search } from 'lucide-react';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@shared/insights';
import { useUI } from '@/store/ui';
import { useInsightsData } from '@/hooks/useInsightsData';
import { ER_FORMULA } from '@/lib/analytics';
import { formatShort } from '@/lib/date';
import { downloadFile, toCsv } from '@/lib/csv';
import { accountKpis, dailyValue, fmtMetric, pctDelta, snapshotsFor, UNLINKED, type AccountKpis, type PostRow } from '@/lib/insights';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { Checkbox } from '@/components/ui/Checkbox';
import { Tooltip } from '@/components/ui/Tooltip';
import { FilterChip } from '@/components/content/FilterBar';
import { usePillarOptions } from '@/components/content/Pickers';
import { PillarBadge } from '@/components/badges/Badges';
import { InsightsToolbar, PlatformDot, SyncStatusBanner } from '@/components/insights/InsightsToolbar';
import { AccountKpiGrid, FollowersPanel, Panel, TrendPanels } from '@/components/insights/InsightsOverview';
import { LinkButton, PostThumb, SourceTag, useOpenRow } from '@/components/insights/PostPieces';

/* ---------------------------------------------------------------- */
/* Account tab                                                        */
/* ---------------------------------------------------------------- */

const COMPARE: { key: keyof AccountKpis; label: string; kind?: 'pct' }[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'netFollowers', label: 'Net follower growth' },
  { key: 'reach', label: 'Reach (sum of daily)' },
  { key: 'views', label: 'Views' },
  { key: 'interactions', label: 'Total interactions' },
  { key: 'er', label: 'Engagement rate', kind: 'pct' },
  { key: 'profileVisits', label: 'Profile visits' },
  { key: 'linkClicks', label: 'Link clicks' },
];

function Delta({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.5) return <span className="text-ink-4">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11.5px] font-semibold tabular', value >= 0 ? 'text-emerald-700' : 'text-red-600')}>
      {value >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function AccountTab() {
  const d = useInsightsData();
  const daily = useMemo(
    () =>
      d.snapshots
        .filter((s) => d.platforms.includes(s.platform) && s.date >= d.period.since && s.date <= d.period.until)
        .sort((a, b) => b.date.localeCompare(a.date) || a.platform.localeCompare(b.platform)),
    [d.snapshots, d.platforms, d.period],
  );

  // The comparison always shows both platforms, whatever the platform filter.
  const both = useMemo(
    () =>
      Object.fromEntries(
        SOCIAL_PLATFORMS.map((p) => [p, { cur: accountKpis(snapshotsFor(d.snapshots, p, d.period)), prev: accountKpis(snapshotsFor(d.snapshots, p, d.prev)) }]),
      ) as Record<SocialPlatform, { cur: AccountKpis; prev: AccountKpis }>,
    [d.snapshots, d.period, d.prev],
  );

  const exportDaily = () => {
    const header = ['Date', 'Platform', 'Followers', 'Followers estimated', 'Net followers', 'Reach', 'Views', 'Interactions', 'Engagement rate %', 'Profile visits', 'Link clicks', 'Source'];
    const cell = (v: number | undefined) => (v === undefined ? '' : Number(v.toFixed(2)));
    const rows = daily.map((s) => [
      s.date,
      s.platform,
      cell(s.followers),
      s.followersEstimated ? 'yes' : '',
      cell(s.netFollowers),
      cell(s.reach),
      cell(s.views),
      cell(dailyValue(s, 'interactions')),
      cell(dailyValue(s, 'er')),
      cell(s.profileVisits),
      cell(s.linkClicks),
      s.source,
    ]);
    downloadFile(`kardeuce-account-${d.period.since}_${d.period.until}.csv`, toCsv([header, ...rows]));
  };

  return (
    <div className="space-y-4">
      <AccountKpiGrid />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <FollowersPanel className="lg:col-span-7" />
        <Panel title="Platform comparison" subtitle={`${d.period.label} · arrows vs previous ${d.period.days} days`} className="lg:col-span-5">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[340px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-ink-3">
                  <th className="py-1.5 text-left font-medium">Metric</th>
                  {SOCIAL_PLATFORMS.map((p) => (
                    <th key={p} className="py-1.5 text-right font-semibold text-ink" colSpan={2}>
                      <span className="inline-flex items-center gap-1.5">
                        <PlatformDot platform={p} /> {p}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((m) => (
                  <tr key={m.key} className="border-b border-line last:border-b-0">
                    <td className="py-1.5 text-ink-3">
                      {m.key === 'er' ? (
                        <Tooltip content={ER_FORMULA}>
                          <span className="cursor-help underline decoration-dotted underline-offset-2">{m.label}</span>
                        </Tooltip>
                      ) : (
                        m.label
                      )}
                    </td>
                    {SOCIAL_PLATFORMS.map((p) => {
                      const cur = both[p].cur[m.key] as number | null | undefined;
                      const prev = both[p].prev[m.key] as number | null | undefined;
                      return [
                        <td key={`${p}-v`} className={cn('py-1.5 pl-3 text-right font-medium tabular', cur === undefined || cur === null ? 'text-ink-4' : 'text-ink')}>
                          {fmtMetric(cur, m.kind)}
                        </td>,
                        <td key={`${p}-d`} className="w-12 py-1.5 pl-2 text-right">
                          <Delta value={m.key === 'followers' ? null : pctDelta(cur, prev)} />
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <TrendPanels />
      <Panel
        title="Daily account data"
        subtitle={`${daily.length} rows · followers in grey are estimated from daily follows − unfollows`}
        action={
          <Button size="xs" icon={<Download className="h-3 w-3" />} onClick={exportDaily} disabled={!daily.length}>
            Export CSV
          </Button>
        }
      >
        <div className="scrollbar-thin -mx-4 max-h-[420px] overflow-auto sm:-mx-5">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-[#f3f5f0] text-[11.5px] text-ink-2">
              <tr>
                {['Date', 'Platform', 'Followers', 'Net', 'Reach', 'Views', 'Interactions', 'ER', 'Profile visits', 'Link clicks'].map((h, i) => (
                  <th key={h} className={cn('px-3 py-2 font-semibold', i < 2 ? 'text-left' : 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="px-3 py-1.5 text-ink-2 tabular">{formatShort(s.date)}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <PlatformDot platform={s.platform} /> {s.platform}
                      {s.source === 'mock' && <SourceTag source="mock" />}
                    </span>
                  </td>
                  <td className={cn('px-3 py-1.5 text-right tabular', s.followersEstimated ? 'text-ink-4' : 'text-ink')}>{fmtMetric(s.followers)}</td>
                  <td className="px-3 py-1.5 text-right tabular">{s.netFollowers === undefined ? <span className="text-ink-4">—</span> : `${s.netFollowers >= 0 ? '+' : ''}${s.netFollowers}`}</td>
                  {(['reach', 'views', 'interactions'] as const).map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right text-ink tabular">
                      {fmtMetric(dailyValue(s, k))}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium text-ink tabular">{fmtMetric(dailyValue(s, 'er'), 'pct')}</td>
                  <td className="px-3 py-1.5 text-right tabular">{fmtMetric(s.profileVisits)}</td>
                  <td className="px-3 py-1.5 text-right tabular">{fmtMetric(s.linkClicks)}</td>
                </tr>
              ))}
              {!daily.length && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-ink-4">
                    No account data for this period yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Content tab                                                        */
/* ---------------------------------------------------------------- */

interface Col {
  key: string;
  label: string;
  get: (r: PostRow) => number | null | undefined;
  kind?: 'pct' | 'seconds';
  default?: boolean;
  hint?: string;
}

const COLUMNS: Col[] = [
  { key: 'views', label: 'Views', get: (r) => r.metrics.views, default: true },
  { key: 'reach', label: 'Reach', get: (r) => r.metrics.reach, default: true },
  { key: 'likes', label: 'Likes', get: (r) => r.metrics.likes, default: true },
  { key: 'comments', label: 'Comments', get: (r) => r.metrics.comments, default: true },
  { key: 'shares', label: 'Shares', get: (r) => r.metrics.shares, default: true },
  { key: 'saves', label: 'Saves / Fav.', get: (r) => r.metrics.saves, default: true, hint: 'Instagram saves · TikTok favorites' },
  { key: 'er', label: 'ER', get: (r) => r.er, kind: 'pct', default: true, hint: ER_FORMULA },
  { key: 'totalInteractions', label: 'Interactions', get: (r) => r.metrics.totalInteractions },
  { key: 'profileVisits', label: 'Profile visits', get: (r) => r.metrics.profileVisits },
  { key: 'follows', label: 'Follows', get: (r) => r.metrics.follows },
  { key: 'avgWatchTime', label: 'Avg. watch', get: (r) => r.metrics.avgWatchTime, kind: 'seconds', default: true },
  { key: 'totalWatchTime', label: 'Total watch', get: (r) => r.metrics.totalWatchTime, kind: 'seconds' },
  { key: 'completionRate', label: 'Completion', get: (r) => r.metrics.completionRate, kind: 'pct', hint: 'TikTok full-watch rate' },
  { key: 'skipRate', label: 'Skip rate', get: (r) => r.metrics.skipRate, kind: 'pct', hint: 'Instagram Reels skip rate' },
  { key: 'storyReplies', label: 'Story replies', get: (r) => r.metrics.storyReplies },
  { key: 'fyp', label: 'For You %', get: (r) => r.metrics.trafficSources?.['For You'], kind: 'pct', hint: 'TikTok traffic from the For You feed' },
];

type SortKey = 'date' | string;

function ContentTab() {
  const d = useInsightsData();
  const openRow = useOpenRow();
  const visiblePref = useUI((s) => s.postColumns);
  const setVisible = useUI((s) => s.setPostColumns);
  const visible = visiblePref.length ? visiblePref : COLUMNS.filter((c) => c.default).map((c) => c.key);
  const cols = COLUMNS.filter((c) => visible.includes(c.key));
  const pillarOptions = usePillarOptions();

  const [q, setQ] = useState('');
  const [fPillars, setFPillars] = useState<string[]>([]);
  const [fFormats, setFFormats] = useState<string[]>([]);
  const [link, setLink] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLButtonElement>(null);

  const formats = useMemo(() => Array.from(new Set(d.rows.map((r) => r.format))).sort(), [d.rows]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = d.rows.filter(
      (r) =>
        (!needle || r.title.toLowerCase().includes(needle) || r.caption.toLowerCase().includes(needle)) &&
        (!fPillars.length || fPillars.includes(r.pillar)) &&
        (!fFormats.length || fFormats.includes(r.format)) &&
        (link === 'all' || (link === 'linked' ? !!r.content : !r.content)),
    );
    const col = COLUMNS.find((c) => c.key === sort.key);
    const val = (r: PostRow): number | string => (sort.key === 'date' ? r.publishedAt : col?.get(r) ?? Number.NEGATIVE_INFINITY);
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [d.rows, q, fPillars, fFormats, link, sort]);

  const unlinkedCount = d.rows.filter((r) => r.post && !r.content).length;

  const exportCsv = () => {
    const header = ['Platform', 'Published', 'Title', 'Pillar', 'Format', 'Linked content', 'Source', 'Permalink', ...COLUMNS.map((c) => c.label), 'Caption'];
    const body = rows.map((r) => [
      r.platform,
      r.publishedAt,
      r.title,
      r.pillar,
      r.format,
      r.content?.title ?? '',
      r.source,
      r.permalink,
      ...COLUMNS.map((c) => {
        const v = c.get(r);
        return v === undefined || v === null ? '' : Number(v.toFixed(2));
      }),
      r.caption,
    ]);
    downloadFile(`kardeuce-posts-${d.period.since}_${d.period.until}.csv`, toCsv([header, ...body]));
  };

  const th = (key: SortKey, label: string, hint?: string, align: 'left' | 'right' = 'right') => (
    <th key={key} className={cn('px-2 py-2.5 whitespace-nowrap', align === 'right' ? 'text-right' : 'pl-4 text-left sm:pl-5')}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
        className={cn('inline-flex items-center gap-1', sort.key === key ? 'text-ink' : 'text-ink-3 hover:text-ink')}
        title={hint}
      >
        {label}
        {sort.key === key && (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-4 pb-3 sm:px-5">
        <label className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
          <input className="input h-8 pl-8 text-[12.5px]" placeholder="Search title or caption…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <FilterChip label="Pillar" options={[...pillarOptions, { value: UNLINKED, label: 'Unlinked' }]} value={fPillars} onChange={setFPillars} />
        <FilterChip label="Format" options={formats.map((f) => ({ value: f, label: f }))} value={fFormats} onChange={setFFormats} />
        <Segmented
          size="sm"
          value={link}
          onChange={setLink}
          options={[
            { value: 'all', label: 'All' },
            { value: 'linked', label: 'Linked' },
            { value: 'unlinked', label: `Unlinked${unlinkedCount ? ` (${unlinkedCount})` : ''}` },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[12px] text-ink-3">{rows.length} posts</span>
          <Button ref={colsRef} size="sm" icon={<Columns3 className="h-3.5 w-3.5" />} onClick={() => setColsOpen((o) => !o)}>
            Columns
          </Button>
          <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={!rows.length}>
            CSV
          </Button>
        </div>
        <Popover open={colsOpen} anchor={colsRef.current} onClose={() => setColsOpen(false)} align="end" width={230}>
          <div className="max-h-[60vh] space-y-0.5 overflow-y-auto p-1.5">
            {COLUMNS.map((c) => (
              <div key={c.key} className="rounded-md px-1.5 py-1 hover:bg-hover">
                <Checkbox
                  checked={visible.includes(c.key)}
                  label={c.label}
                  onChange={(on) => setVisible(on ? [...visible, c.key] : visible.filter((k) => k !== c.key))}
                />
              </div>
            ))}
            <button type="button" className="mt-1 w-full rounded-md px-2 py-1 text-left text-[12px] text-ink-3 hover:bg-hover" onClick={() => setVisible([])}>
              Reset to default
            </button>
          </div>
        </Popover>
      </div>

      {d.loading ? (
        <div className="space-y-2 px-5 pb-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[#e9ece5]" />
          ))}
        </div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: 420 + cols.length * 76 }}>
            <thead className="border-y border-line bg-[#f3f5f0] text-[12px] font-semibold">
              <tr>
                {th('date', 'Post', undefined, 'left')}
                <th className="px-2 py-2.5 text-ink-3">Pillar · format</th>
                {cols.map((c) => th(c.key, c.label, c.hint))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-line text-[12.5px] last:border-b-0 hover:bg-hover" onClick={() => openRow(r)}>
                  <td className="max-w-[280px] px-2 py-1.5 pl-4 sm:pl-5">
                    <div className="flex items-center gap-2.5">
                      <PostThumb row={r} size={36} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{r.title}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
                          <span className="tabular">
                            {formatShort(r.date)}
                            {r.hour !== null && ` · ${new Date(r.publishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                          </span>
                          <SourceTag source={r.source} />
                          {r.permalink && (
                            <a href={r.permalink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center hover:text-ink" aria-label="Open live post">
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          )}
                          {r.post && <LinkButton postId={r.post.id} linked={!!r.content} />}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {r.pillar !== UNLINKED ? <PillarBadge pillar={r.pillar} size="xs" /> : <span className="text-[11.5px] text-ink-4">Unlinked</span>}
                      <span className="text-[11.5px] text-ink-3">{r.format}</span>
                    </div>
                  </td>
                  {cols.map((c) => {
                    const v = c.get(r);
                    return (
                      <td key={c.key} className={cn('px-2 py-1.5 text-right whitespace-nowrap tabular last:pr-4 sm:last:pr-5', v === undefined || v === null ? 'text-ink-4' : c.key === 'er' ? 'font-semibold text-ink' : 'text-ink')}>
                        {fmtMetric(v, c.kind)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={cols.length + 2} className="px-5 py-10 text-center text-[12.5px] text-ink-4">
                    No posts match this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-4 sm:px-5">“—” means the platform doesn’t provide that metric for this post type. Manual rows come from numbers typed into the content drawer.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- */

export function PerformancePage() {
  const d = useInsightsData();
  const [tab, setTab] = useState<'account' | 'content'>('account');
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Performance"
        subtitle="Account growth and every post’s insights from Instagram & TikTok."
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'account', label: 'Account' },
              { value: 'content', label: `Content (${d.rows.length})` },
            ]}
          />
        }
      />
      <div className="card p-3">
        <InsightsToolbar period={d.period} />
      </div>
      <SyncStatusBanner platforms={d.platforms} />
      {tab === 'account' ? <AccountTab /> : <ContentTab />}
    </div>
  );
}
