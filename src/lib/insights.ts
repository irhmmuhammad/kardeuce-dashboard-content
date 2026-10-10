import type { PostMetrics, PostType, SocialPlatform } from '@shared/insights';
import { SOCIAL_PLATFORMS } from '@shared/insights';
import type { AccountSnapshot, ContentItem, InsightsPeriodKind, ISODate, PlatformFilter, PlatformPost } from '@/types';
import { addDays, currentMonthKey, diffDays, monthStart, parseISO, todayISO, toISO } from './date';
import { erOf, interactionsOf } from './analytics';
import { formatNumber, formatPct } from './utils';

/* ---------------------------------------------------------------- */
/* Periods                                                            */
/* ---------------------------------------------------------------- */

export interface Period {
  since: ISODate;
  until: ISODate;
  days: number;
  label: string;
}

export function resolvePeriod(kind: InsightsPeriodKind, custom?: { since: ISODate; until: ISODate }): Period {
  const today = todayISO();
  const make = (since: ISODate, until: ISODate, label: string): Period => ({ since, until, days: diffDays(since, until) + 1, label });
  switch (kind) {
    case '7d':
      return make(addDays(today, -6), today, 'last 7 days');
    case '28d':
      return make(addDays(today, -27), today, 'last 28 days');
    case '90d':
      return make(addDays(today, -89), today, 'last 90 days');
    case 'month':
      return make(monthStart(currentMonthKey()), today, 'this month');
    case 'custom': {
      const since = custom?.since || addDays(today, -27);
      const until = custom?.until && custom.until >= since ? custom.until : today;
      return make(since, until, 'custom range');
    }
  }
}

/** The same number of days immediately before. */
export function previousPeriod(p: Period): Period {
  const until = addDays(p.since, -1);
  const since = addDays(until, -(p.days - 1));
  return { since, until, days: p.days, label: `previous ${p.days} days` };
}

export const inPeriod = (date: ISODate, p: Period) => date >= p.since && date <= p.until;

export function platformsOf(filter: PlatformFilter): SocialPlatform[] {
  return filter === 'all' ? SOCIAL_PLATFORMS : [filter];
}

/** % change; null when either side is unknown or the base is 0. */
export function pctDelta(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur === undefined || cur === null || prev === undefined || prev === null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/* ---------------------------------------------------------------- */
/* Account KPIs                                                       */
/* ---------------------------------------------------------------- */

export interface AccountKpis {
  followers?: number;
  netFollowers?: number;
  reach?: number;
  views?: number;
  interactions?: number;
  profileVisits?: number;
  linkClicks?: number;
  er: number | null;
  days: number;
}

export type DailyKey = 'followers' | 'netFollowers' | 'reach' | 'views' | 'interactions' | 'profileVisits' | 'er';

function sumDefined(values: (number | undefined)[]): number | undefined {
  const d = values.filter((v): v is number => v !== undefined);
  return d.length ? d.reduce((s, v) => s + v, 0) : undefined;
}

export function dayInteractions(s: AccountSnapshot): number | undefined {
  return s.interactions ?? interactionsOf({ likes: s.likes, comments: s.comments, shares: s.shares, saves: s.saves });
}

export function snapshotsFor(snaps: AccountSnapshot[], platform: SocialPlatform, period: Period): AccountSnapshot[] {
  return snaps.filter((s) => s.platform === platform && inPeriod(s.date, period)).sort((a, b) => a.date.localeCompare(b.date));
}

export function accountKpis(snaps: AccountSnapshot[]): AccountKpis {
  const withFollowers = snaps.filter((s) => s.followers !== undefined);
  const first = withFollowers[0];
  const last = withFollowers[withFollowers.length - 1];
  const net = sumDefined(snaps.map((s) => s.netFollowers));
  const reach = sumDefined(snaps.map((s) => s.reach));
  const views = sumDefined(snaps.map((s) => s.views));
  const interactions = sumDefined(snaps.map(dayInteractions));
  const base = reach || views;
  return {
    followers: last?.followers,
    netFollowers: net ?? (first && last && first !== last ? (last.followers ?? 0) - (first.followers ?? 0) : undefined),
    reach,
    views,
    interactions,
    profileVisits: sumDefined(snaps.map((s) => s.profileVisits)),
    linkClicks: sumDefined(snaps.map((s) => s.linkClicks)),
    er: interactions !== undefined && base ? (interactions / base) * 100 : null,
    days: snaps.length,
  };
}

/** Several platforms added together (ER recomputed from the totals). */
export function combineKpis(list: AccountKpis[]): AccountKpis {
  const pick = (k: keyof Omit<AccountKpis, 'er' | 'days'>) => sumDefined(list.map((x) => x[k]));
  const interactions = pick('interactions');
  const reach = pick('reach');
  const views = pick('views');
  const base = reach || views;
  return {
    followers: pick('followers'),
    netFollowers: pick('netFollowers'),
    reach,
    views,
    interactions,
    profileVisits: pick('profileVisits'),
    linkClicks: pick('linkClicks'),
    er: interactions !== undefined && base ? (interactions / base) * 100 : null,
    days: Math.max(0, ...list.map((x) => x.days)),
  };
}

export function dailyValue(s: AccountSnapshot | undefined, key: DailyKey): number | undefined {
  if (!s) return undefined;
  if (key === 'interactions') return dayInteractions(s);
  if (key === 'er') {
    const i = dayInteractions(s);
    const base = s.reach || s.views;
    return i !== undefined && base ? (i / base) * 100 : undefined;
  }
  return s[key];
}

/** One value per day of the period (undefined where there's no data) — for sparklines. */
export function dailySeries(snaps: AccountSnapshot[], platforms: SocialPlatform[], period: Period, key: DailyKey): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  for (let d = period.since; d <= period.until; d = addDays(d, 1)) {
    const day = snaps.filter((s) => s.date === d && platforms.includes(s.platform));
    if (key === 'er') {
      const i = sumDefined(day.map(dayInteractions));
      const base = sumDefined(day.map((s) => s.reach)) || sumDefined(day.map((s) => s.views));
      out.push(i !== undefined && base ? (i / base) * 100 : undefined);
    } else out.push(sumDefined(day.map((s) => dailyValue(s, key))));
  }
  return out;
}

/** Chart rows: one per day (or per week for long periods), a column per platform. */
export function trendRows(
  snaps: AccountSnapshot[],
  platforms: SocialPlatform[],
  period: Period,
  key: DailyKey,
): { label: string; date: ISODate; Instagram?: number; TikTok?: number }[] {
  const weekly = period.days > 35;
  const rows: { label: string; date: ISODate; Instagram?: number; TikTok?: number }[] = [];
  const step = weekly ? 7 : 1;
  for (let d = period.since; d <= period.until; d = addDays(d, step)) {
    const end = weekly ? (addDays(d, 6) < period.until ? addDays(d, 6) : period.until) : d;
    const row: { label: string; date: ISODate; Instagram?: number; TikTok?: number } = {
      date: d,
      label: parseISO(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    };
    for (const p of platforms) {
      const span = snaps.filter((s) => s.platform === p && s.date >= d && s.date <= end);
      if (!span.length) continue;
      if (key === 'followers') {
        const last = span.filter((s) => s.followers !== undefined).pop();
        row[p] = last?.followers;
      } else if (key === 'er') {
        const k = accountKpis(span);
        row[p] = k.er ?? undefined;
      } else row[p] = sumDefined(span.map((s) => dailyValue(s, key)));
    }
    rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------------- */
/* Post rows (synced posts + manual-only content)                     */
/* ---------------------------------------------------------------- */

export interface PostRow {
  id: string;
  platform: SocialPlatform;
  title: string;
  caption: string;
  date: ISODate;
  /** Local hour 0–23, null for manual rows. */
  hour: number | null;
  publishedAt: string;
  pillar: string;
  format: string;
  type: PostType | string;
  thumbnail: string;
  permalink: string;
  metrics: PostMetrics;
  er: number | null;
  source: 'api' | 'mock' | 'manual';
  post?: PlatformPost;
  content?: ContentItem;
}

export const UNLINKED = 'Unlinked';

function captionTitle(caption: string): string {
  const line = caption.split('\n').find((l) => l.trim()) ?? '';
  return line.replace(/#[\p{L}\p{N}_]+/gu, '').trim().slice(0, 80) || '(no caption)';
}

export function buildPostRows(posts: PlatformPost[], contents: ContentItem[]): PostRow[] {
  const byId = new Map(contents.map((c) => [c.id, c]));
  const rows: PostRow[] = [];
  const covered = new Set<string>();
  for (const p of posts) {
    const content = p.linkedContentId && p.linkMethod !== 'none' ? byId.get(p.linkedContentId) : undefined;
    const d = new Date(p.publishedAt);
    const valid = !Number.isNaN(d.getTime());
    // When the team chose to keep manual numbers, those are the numbers that count.
    const set = content?.platformMetrics[p.platform];
    const metrics = set?.source === 'manual' && set.keepManual ? set.values : p.metrics;
    if (content) covered.add(`${content.id}:${p.platform}`);
    rows.push({
      id: p.id,
      platform: p.platform,
      title: content?.title ?? captionTitle(p.caption),
      caption: p.caption,
      date: valid ? toISO(d) : p.publishedAt.slice(0, 10),
      hour: valid ? d.getHours() : null,
      publishedAt: p.publishedAt,
      pillar: content?.contentPillar || p.demoPillar || UNLINKED,
      format: content?.contentType || p.demoFormat || p.type,
      type: p.type,
      thumbnail: p.thumbnail || content?.coverImage || '',
      permalink: p.permalink,
      metrics,
      er: erOf(metrics),
      source: p.source,
      post: p,
      content,
    });
  }
  // Content with manual numbers and no synced post still counts.
  for (const c of contents) {
    for (const platform of SOCIAL_PLATFORMS) {
      const set = c.platformMetrics[platform];
      if (!set || set.source !== 'manual' || covered.has(`${c.id}:${platform}`) || !c.publishDate) continue;
      rows.push({
        id: `manual:${c.id}:${platform}`,
        platform,
        title: c.title,
        caption: c.caption,
        date: c.publishDate,
        hour: null,
        publishedAt: c.publishDate,
        pillar: c.contentPillar || UNLINKED,
        format: c.contentType,
        type: c.contentType,
        thumbnail: c.coverImage,
        permalink: c.contentUrl,
        metrics: set.values,
        er: erOf(set.values),
        source: 'manual',
        content: c,
      });
    }
  }
  return rows;
}

export function rowsIn(rows: PostRow[], platforms: SocialPlatform[], period: Period): PostRow[] {
  return rows.filter((r) => platforms.includes(r.platform) && inPeriod(r.date, period));
}

/* ---------------------------------------------------------------- */
/* Grouping                                                           */
/* ---------------------------------------------------------------- */

export type GroupMetric = 'er' | 'saves' | 'shares' | 'reach' | 'views';

export const GROUP_METRIC_LABEL: Record<GroupMetric, string> = {
  er: 'Avg. ER',
  saves: 'Avg. saves',
  shares: 'Avg. shares',
  reach: 'Avg. reach',
  views: 'Avg. views',
};

function avg(values: (number | null | undefined)[]): number | undefined {
  const d = values.filter((v): v is number => v !== undefined && v !== null);
  return d.length ? d.reduce((s, v) => s + v, 0) / d.length : undefined;
}

export function metricOf(r: PostRow, m: GroupMetric): number | null | undefined {
  return m === 'er' ? r.er : r.metrics[m];
}

export interface GroupRow {
  name: string;
  Instagram?: number;
  TikTok?: number;
  posts: Partial<Record<SocialPlatform, number>>;
}

export function groupBy(rows: PostRow[], key: (r: PostRow) => string, metric: GroupMetric, order: string[] = []): GroupRow[] {
  const names = Array.from(new Set([...order, ...rows.map(key)])).filter((n) => rows.some((r) => key(r) === n));
  return names.map((name) => {
    const g: GroupRow = { name, posts: {} };
    for (const p of SOCIAL_PLATFORMS) {
      const list = rows.filter((r) => key(r) === name && r.platform === p);
      if (!list.length) continue;
      g.posts[p] = list.length;
      const v = avg(list.map((r) => metricOf(r, metric)));
      if (v !== undefined) g[p] = Number(v.toFixed(metric === 'er' ? 2 : 0));
    }
    return g;
  });
}

/* ---------------------------------------------------------------- */
/* Best time to post                                                  */
/* ---------------------------------------------------------------- */

export const HOUR_BUCKETS = [
  { from: 0, to: 6, label: '00–06' },
  { from: 6, to: 9, label: '06–09' },
  { from: 9, to: 12, label: '09–12' },
  { from: 12, to: 15, label: '12–15' },
  { from: 15, to: 18, label: '15–18' },
  { from: 18, to: 21, label: '18–21' },
  { from: 21, to: 24, label: '21–24' },
];
export const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export interface HeatCell {
  day: number; // 0 = Monday
  bucket: number;
  posts: number;
  /** Avg. ER of posts in this slot relative to the overall avg (1 = average). */
  index: number | null;
  avgEr: number | null;
}

export function bestTimeGrid(rows: PostRow[]): { cells: HeatCell[]; overallEr: number | null } {
  const timed = rows.filter((r) => r.hour !== null && r.er !== null);
  const overall = avg(timed.map((r) => r.er)) ?? null;
  const cells: HeatCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let b = 0; b < HOUR_BUCKETS.length; b++) {
      const { from, to } = HOUR_BUCKETS[b];
      const list = timed.filter((r) => (parseISO(r.date).getDay() + 6) % 7 === day && r.hour! >= from && r.hour! < to);
      const a = avg(list.map((r) => r.er)) ?? null;
      cells.push({ day, bucket: b, posts: list.length, avgEr: a, index: a !== null && overall ? a / overall : null });
    }
  }
  return { cells, overallEr: overall };
}

/* ---------------------------------------------------------------- */
/* Auto-generated insights                                            */
/* ---------------------------------------------------------------- */

export interface Insight {
  id: string;
  tone: 'good' | 'warn' | 'info';
  text: string;
}

const ratio = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}×`;

export function generateInsights(input: {
  rows: PostRow[];
  kpis: Partial<Record<SocialPlatform, AccountKpis>>;
  prevKpis: Partial<Record<SocialPlatform, AccountKpis>>;
  period: Period;
  platforms: SocialPlatform[];
}): Insight[] {
  const { rows, kpis, prevKpis, period, platforms } = input;
  const out: Insight[] = [];
  const scored = rows.filter((r) => r.er !== null);

  // Format × pillar combos that out-save the average.
  const avgSaves = avg(rows.map((r) => r.metrics.saves));
  if (avgSaves) {
    const combos = new Map<string, PostRow[]>();
    for (const r of rows) if (r.pillar !== UNLINKED) combos.set(`${r.format}|${r.pillar}`, [...(combos.get(`${r.format}|${r.pillar}`) ?? []), r]);
    let best: { key: string; x: number; n: number } | null = null;
    combos.forEach((list, key) => {
      const s = avg(list.map((r) => r.metrics.saves));
      if (list.length >= 3 && s && (!best || s / avgSaves > best.x)) best = { key, x: s / avgSaves, n: list.length };
    });
    const b = best as { key: string; x: number; n: number } | null;
    if (b && b.x >= 1.4) {
      const [format, pillar] = b.key.split('|');
      out.push({ id: 'saves-combo', tone: 'good', text: `${format} ${pillar} dapat ${ratio(b.x)} saves dibanding rata-rata (${b.n} posts).` });
    }
  }

  // Reach movement per platform vs the previous period.
  for (const p of platforms) {
    const d = pctDelta(kpis[p]?.reach, prevKpis[p]?.reach);
    if (d !== null && Math.abs(d) >= 10) {
      out.push({
        id: `reach-${p}`,
        tone: d > 0 ? 'good' : 'warn',
        text: `${p} reach ${d > 0 ? 'naik' : 'turun'} ${Math.abs(d).toFixed(0)}% vs ${period.days} hari sebelumnya.`,
      });
    }
  }

  // Best posting window.
  const { cells, overallEr } = bestTimeGrid(scored);
  if (overallEr) {
    const byBucket = HOUR_BUCKETS.map((b, i) => {
      const list = scored.filter((r) => r.hour !== null && r.hour >= b.from && r.hour < b.to);
      return { i, n: list.length, er: avg(list.map((r) => r.er)) };
    }).filter((x) => x.n >= 3 && x.er !== undefined);
    const top = byBucket.sort((a, b) => (b.er ?? 0) - (a.er ?? 0))[0];
    if (top && top.er! / overallEr >= 1.12) {
      const b = HOUR_BUCKETS[top.i];
      out.push({
        id: 'best-time',
        tone: 'info',
        text: `Post jam ${String(b.from).padStart(2, '0')}.00–${String(b.to).padStart(2, '0')}.00 performa terbaik: ER ${ratio(top.er! / overallEr)} rata-rata.`,
      });
    }
    const byDay = WEEKDAYS.map((name, day) => {
      const list = cells.filter((c) => c.day === day);
      const n = list.reduce((s, c) => s + c.posts, 0);
      const er = n ? list.reduce((s, c) => s + (c.avgEr ?? 0) * c.posts, 0) / n : undefined;
      return { name, n, er };
    }).filter((x) => x.n >= 3 && x.er !== undefined);
    const bestDay = byDay.sort((a, b) => (b.er ?? 0) - (a.er ?? 0))[0];
    if (bestDay && bestDay.er! / overallEr >= 1.15) {
      out.push({ id: 'best-day', tone: 'info', text: `Hari ${dayName(bestDay.name)} paling engaging (ER ${formatPct(bestDay.er!)}).` });
    }
  }

  // Highest-ER pillar.
  const pillars = new Map<string, number[]>();
  for (const r of scored) if (r.pillar !== UNLINKED) pillars.set(r.pillar, [...(pillars.get(r.pillar) ?? []), r.er!]);
  const pillarAvg = Array.from(pillars.entries())
    .filter(([, l]) => l.length >= 3)
    .map(([name, l]) => ({ name, er: l.reduce((s, v) => s + v, 0) / l.length }))
    .sort((a, b) => b.er - a.er);
  if (pillarAvg.length >= 2) out.push({ id: 'top-pillar', tone: 'good', text: `Pillar ${pillarAvg[0].name} punya ER tertinggi (${formatPct(pillarAvg[0].er)}).` });

  // Follower growth comparison.
  if (platforms.length === 2) {
    const ig = kpis.Instagram?.netFollowers;
    const tt = kpis.TikTok?.netFollowers;
    if (ig !== undefined && tt !== undefined && ig > 0 && tt > 0) {
      const [fast, slow, x] = tt >= ig ? ['TikTok', 'Instagram', tt / ig] : ['Instagram', 'TikTok', ig / tt];
      if ((x as number) >= 1.3) out.push({ id: 'growth', tone: 'info', text: `Followers ${fast} tumbuh ${ratio(x as number)} lebih cepat dari ${slow} (${formatNumber(Math.max(ig, tt))} vs ${formatNumber(Math.min(ig, tt))}).` });
    } else if (ig !== undefined && ig < 0) out.push({ id: 'ig-loss', tone: 'warn', text: `Instagram kehilangan ${formatNumber(Math.abs(ig))} followers di periode ini.` });
  }

  // TikTok completion rate.
  const completion = avg(rows.filter((r) => r.platform === 'TikTok').map((r) => r.metrics.completionRate));
  if (completion !== undefined && completion < 20) {
    out.push({ id: 'completion', tone: 'warn', text: `Completion rate TikTok rata-rata ${formatPct(completion)}. Coba hook 3 detik pertama yang lebih kuat.` });
  }

  const unlinked = rows.filter((r) => r.post && !r.content).length;
  if (unlinked) out.push({ id: 'unlinked', tone: 'info', text: `${unlinked} post belum terhubung ke Content Plan. Link biar insight per pillar lebih akurat.` });

  return out;
}

function dayName(short: string): string {
  return { Sen: 'Senin', Sel: 'Selasa', Rab: 'Rabu', Kam: 'Kamis', Jum: 'Jumat', Sab: 'Sabtu', Min: 'Minggu' }[short] ?? short;
}

/* ---------------------------------------------------------------- */
/* Formatting                                                         */
/* ---------------------------------------------------------------- */

/** "—" for metrics the platform doesn't provide. */
export function fmtMetric(v: number | null | undefined, kind: 'number' | 'pct' | 'seconds' = 'number'): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  if (kind === 'pct') return formatPct(v, v < 10 ? 2 : 1);
  if (kind === 'seconds') return v >= 3600 ? `${(v / 3600).toFixed(1)}h` : v >= 60 ? `${(v / 60).toFixed(1)}m` : `${v.toFixed(1)}s`;
  return formatNumber(v, { compact: true });
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
