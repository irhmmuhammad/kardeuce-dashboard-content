import type {
  ContentFilters,
  ContentItem,
  ContentMetrics,
  MonthKey,
  Pillar,
  PlatformMetricSet,
  PostMetrics,
  SocialPlatform,
  SortDir,
  SortKey,
  StatusOption,
  StatusStage,
} from '@/types';
import { daysInMonth, diffDays, formatShort, monthKeyOf } from './date';

/* ---------------------------------------------------------------- */
/* Filtering & sorting                                                */
/* ---------------------------------------------------------------- */

export function inMonth(c: ContentItem, month: MonthKey | 'all'): boolean {
  if (month === 'all') return true;
  return c.publishDate ? monthKeyOf(c.publishDate) === month : false;
}

export function matchesFilters(c: ContentItem, f: ContentFilters): boolean {
  if (f.platforms.length && !c.platform.some((p) => f.platforms.includes(p))) return false;
  if (f.pillars.length && !f.pillars.includes(c.contentPillar)) return false;
  if (f.types.length && !f.types.includes(c.contentType)) return false;
  if (f.statuses.length && !f.statuses.includes(c.status)) return false;
  if (f.owners.length && !f.owners.includes(c.owner || '__none')) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${c.title}\n${c.brief}\n${c.caption}\n${c.hook}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function sortContents(
  items: ContentItem[],
  sort: { key: SortKey; dir: SortDir },
  statuses: StatusOption[],
): ContentItem[] {
  const statusIndex = new Map(statuses.map((s, i) => [s.name, i]));
  const dir = sort.dir === 'asc' ? 1 : -1;
  const byDate = (a: ContentItem, b: ContentItem) => {
    // Undated content always sinks to the bottom.
    if (!a.publishDate && !b.publishDate) return a.order - b.order;
    if (!a.publishDate) return 1;
    if (!b.publishDate) return -1;
    return a.publishDate.localeCompare(b.publishDate) || a.order - b.order;
  };
  return items.slice().sort((a, b) => {
    switch (sort.key) {
      case 'manual':
        return (a.order - b.order) * dir;
      case 'publishDate': {
        if (!a.publishDate || !b.publishDate) return byDate(a, b);
        return byDate(a, b) * dir;
      }
      case 'status':
        return ((statusIndex.get(a.status) ?? 99) - (statusIndex.get(b.status) ?? 99)) * dir || byDate(a, b);
      case 'contentPillar':
        return a.contentPillar.localeCompare(b.contentPillar) * dir || byDate(a, b);
      case 'contentType':
        return a.contentType.localeCompare(b.contentType) * dir || byDate(a, b);
      case 'title':
        return a.title.localeCompare(b.title, 'id') * dir;
      default:
        return 0;
    }
  });
}

export function stageOf(status: string, statuses: StatusOption[]): StatusStage {
  return statuses.find((s) => s.name === status)?.stage ?? 'progress';
}

/* ---------------------------------------------------------------- */
/* Metrics                                                            */
/* ---------------------------------------------------------------- */

/** The one engagement-rate formula used everywhere (shown in tooltips). */
export const ER_FORMULA =
  'Engagement rate = interactions (likes + comments + shares + saves) ÷ reach × 100. When a platform doesn’t report reach, views are used instead.';

const INTERACTION_KEYS = ['likes', 'comments', 'shares', 'saves'] as const;
const SUMMABLE_KEYS = [
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'totalInteractions',
  'profileVisits',
  'follows',
  'totalWatchTime',
  'storyReplies',
] as const satisfies readonly (keyof PostMetrics)[];

/** likes + comments + shares + saves (only the parts the platform reports). */
export function interactionsOf(m: PostMetrics): number | undefined {
  const parts = INTERACTION_KEYS.map((k) => m[k]).filter((v): v is number => v !== undefined);
  if (parts.length) return parts.reduce((s, v) => s + v, 0);
  return m.totalInteractions;
}

/** Engagement rate in %, or null when there's nothing to divide by. */
export function erOf(m: PostMetrics): number | null {
  const i = interactionsOf(m);
  const base = m.reach || m.views;
  if (i === undefined || !base) return null;
  return (i / base) * 100;
}

/** Legacy manual metrics → PostMetrics (0 = never filled in → undefined). */
export function legacyToPostMetrics(m: ContentMetrics): PostMetrics {
  const v = (n: number) => (n ? n : undefined);
  return {
    views: v(m.views),
    reach: v(m.reach),
    likes: v(m.likes),
    comments: v(m.comments),
    shares: v(m.shares),
    saves: v(m.saves),
    follows: v(m.followersGained),
  };
}

/** Kept for existing callers: same formula, 0 when unknown. */
export function engagementRate(m: ContentMetrics): number {
  return erOf(legacyToPostMetrics(m)) ?? 0;
}

export function isEmptyMetrics(m: PostMetrics): boolean {
  return !SUMMABLE_KEYS.some((k) => m[k] !== undefined && m[k] !== 0);
}

/** Sum metrics; a key stays undefined only when every input lacks it. */
export function sumPostMetrics(list: PostMetrics[]): PostMetrics {
  const out: PostMetrics = {};
  for (const m of list) {
    for (const k of SUMMABLE_KEYS) {
      const val = m[k];
      if (val !== undefined) out[k] = (out[k] ?? 0) + val;
    }
  }
  return out;
}

export interface ContentMetricSource {
  platform: SocialPlatform | 'Combined';
  values: PostMetrics;
  source: 'manual' | 'api' | 'mock';
}

/** Every metric set a content item carries: per platform, plus legacy combined numbers. */
export function contentMetricSets(c: ContentItem): ContentMetricSource[] {
  const sets: ContentMetricSource[] = [];
  for (const [platform, set] of Object.entries(c.platformMetrics ?? {}) as [SocialPlatform, PlatformMetricSet | undefined][]) {
    if (set && !isEmptyMetrics(set.values)) sets.push({ platform, values: set.values, source: set.source });
  }
  const legacy = legacyToPostMetrics(c.metrics);
  if (!isEmptyMetrics(legacy)) sets.push({ platform: 'Combined', values: legacy, source: 'manual' });
  return sets;
}

/** All platforms added together. */
export function contentTotals(c: ContentItem): PostMetrics {
  return sumPostMetrics(contentMetricSets(c).map((s) => s.values));
}

export function contentER(c: ContentItem): number | null {
  return erOf(contentTotals(c));
}

export function hasMetrics(c: ContentItem): boolean {
  return contentMetricSets(c).length > 0;
}

/* ---------------------------------------------------------------- */
/* Planning insights & content health                                 */
/* ---------------------------------------------------------------- */

export interface DistributionRow {
  name: string;
  count: number;
  pct: number;
  color?: string;
  recommended?: number;
}

export type Severity = 'warning' | 'info' | 'success';

export interface Insight {
  id: string;
  severity: Severity;
  message: string;
}

export interface PlanInsights {
  month: MonthKey;
  total: number;
  scheduledDates: number;
  undated: number;
  postsPerWeek: number;
  avgGap: number | null;
  maxGap: { days: number; from: string; to: string } | null;
  pillars: DistributionRow[];
  formats: DistributionRow[];
  insights: Insight[];
}

export function distribution(items: ContentItem[], key: (c: ContentItem) => string, names: string[]): DistributionRow[] {
  const counts = new Map<string, number>();
  names.forEach((n) => counts.set(n, 0));
  items.forEach((c) => {
    const k = key(c) || 'Unassigned';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const total = items.length || 1;
  return Array.from(counts.entries())
    .filter(([name, count]) => names.includes(name) || count > 0)
    .map(([name, count]) => ({ name, count, pct: (count / total) * 100 }));
}

export function computePlanInsights(
  monthItems: ContentItem[],
  month: MonthKey,
  pillars: Pillar[],
  contentTypes: string[],
  undatedCount = 0,
): PlanInsights {
  const total = monthItems.length;
  const pillarRows = distribution(
    monthItems,
    (c) => c.contentPillar,
    pillars.map((p) => p.name),
  ).map((row) => {
    const p = pillars.find((x) => x.name === row.name);
    return { ...row, color: p?.color ?? '#9aa29c', recommended: p?.recommendedPct ?? 0 };
  });
  const formats = distribution(monthItems, (c) => c.contentType, contentTypes).sort((a, b) => b.count - a.count);

  const dates = Array.from(new Set(monthItems.map((c) => c.publishDate).filter(Boolean))).sort();
  let maxGap: PlanInsights['maxGap'] = null;
  let gapSum = 0;
  for (let i = 1; i < dates.length; i++) {
    const d = diffDays(dates[i - 1], dates[i]);
    gapSum += d;
    if (!maxGap || d > maxGap.days) maxGap = { days: d, from: dates[i - 1], to: dates[i] };
  }
  const weeks = daysInMonth(month) / 7;
  const postsPerWeek = total / weeks;

  const insights: Insight[] = [];
  if (total > 0) {
    const sorted = [...pillarRows].sort((a, b) => b.count - a.count);
    const dominant = sorted[0];
    const uniqueTop = !sorted[1] || sorted[1].count < dominant.count;
    if (dominant && total >= 3 && uniqueTop && dominant.pct >= 50) {
      insights.push({ id: 'dominant', severity: 'warning', message: `${dominant.name} content dominates this month (${Math.round(dominant.pct)}%).` });
    }
    for (const row of pillarRows) {
      if (row.count === 0) {
        insights.push({ id: `none-${row.name}`, severity: 'warning', message: `No ${row.name} content scheduled this month.` });
      } else if (row.count === 1) {
        insights.push({ id: `one-${row.name}`, severity: 'info', message: `Only 1 ${row.name} post is planned.` });
      }
      if (row.count > 0 && row.recommended && row.pct < row.recommended - 5) {
        insights.push({
          id: `below-${row.name}`,
          severity: 'info',
          message: `${row.name} content is below the recommended ${row.recommended}% allocation.`,
        });
      }
    }
    if (maxGap && maxGap.days > 5) {
      insights.push({
        id: 'gap',
        severity: 'warning',
        message: `There is a large publishing gap this month (${maxGap.days} days, ${formatShort(maxGap.from)} → ${formatShort(maxGap.to)}).`,
      });
    }
    if (postsPerWeek < 2) {
      insights.push({ id: 'freq', severity: 'info', message: `Only ${postsPerWeek.toFixed(1)} posts per week — aim for at least 2–3.` });
    }
    if (undatedCount > 0) {
      insights.push({ id: 'undated', severity: 'info', message: `${undatedCount} content item${undatedCount > 1 ? 's have' : ' has'} no publish date yet.` });
    }
    if (!insights.some((i) => i.severity === 'warning')) {
      insights.unshift({ id: 'ok', severity: 'success', message: 'Content mix looks healthy for this month. Nice!' });
    }
  }

  return {
    month,
    total,
    scheduledDates: dates.length,
    undated: undatedCount,
    postsPerWeek,
    avgGap: dates.length > 1 ? gapSum / (dates.length - 1) : null,
    maxGap,
    pillars: pillarRows,
    formats,
    insights,
  };
}

export type HealthLevel = 'Good' | 'Fair' | 'Low' | 'Needs Improvement' | 'High';

export interface HealthIndicator {
  key: string;
  label: string;
  level: HealthLevel;
  tone: 'good' | 'warn' | 'bad';
  detail: string;
}

export interface HealthMessage {
  text: string;
  /** Insight ids that already say the same thing (used to avoid duplicates). */
  covers: string[];
}

export interface ContentHealth {
  score: number;
  indicators: HealthIndicator[];
  messages: HealthMessage[];
}

function pillarPct(insights: PlanInsights, pillars: Pillar[], id: string, fallbackName: string): { name: string; pct: number } {
  const p = pillars.find((x) => x.id === id) ?? pillars.find((x) => x.name === fallbackName);
  const name = p?.name ?? fallbackName;
  return { name, pct: insights.pillars.find((r) => r.name === name)?.pct ?? 0 };
}

export function computeContentHealth(insights: PlanInsights, pillars: Pillar[]): ContentHealth {
  const indicators: HealthIndicator[] = [];
  const messages: HealthMessage[] = [];
  const about = (name: string) => [`none-${name}`, `below-${name}`, `one-${name}`];
  let score = 100;

  if (insights.total === 0) {
    return { score: 0, indicators: [], messages: [{ text: 'Nothing planned yet — add content to see the health check.', covers: [] }] };
  }

  // Posting consistency
  const gap = insights.maxGap?.days ?? 0;
  const consistent = gap <= 5 && insights.postsPerWeek >= 2;
  const fair = gap <= 7 && insights.postsPerWeek >= 1.5;
  indicators.push({
    key: 'consistency',
    label: 'Posting Consistency',
    level: consistent ? 'Good' : fair ? 'Fair' : 'Needs Improvement',
    tone: consistent ? 'good' : fair ? 'warn' : 'bad',
    detail: `${insights.postsPerWeek.toFixed(1)} posts/week${insights.maxGap ? ` · longest gap ${insights.maxGap.days}d` : ''}`,
  });
  if (!consistent) score -= fair ? 10 : 20;
  if (gap > 5) messages.push({ text: 'There is a large publishing gap this month.', covers: ['gap'] });

  // Pillar balance (total variation distance vs recommended mix)
  const tvd = insights.pillars.reduce((s, r) => s + Math.abs(r.pct - (r.recommended ?? 0)), 0) / 2;
  const balance = tvd <= 10 ? 'Good' : tvd <= 20 ? 'Fair' : 'Needs Improvement';
  indicators.push({
    key: 'balance',
    label: 'Content Pillar Balance',
    level: balance,
    tone: balance === 'Good' ? 'good' : balance === 'Fair' ? 'warn' : 'bad',
    detail: `${Math.round(tvd)}% off the recommended mix`,
  });
  if (balance !== 'Good') score -= balance === 'Fair' ? 10 : 20;

  const ent = pillarPct(insights, pillars, 'p_entertainment', 'Entertainment');
  if (ent.pct > 60) {
    messages.push({ text: `${ent.name} content is dominating the content plan.`, covers: ['dominant'] });
    score -= 10;
  }

  const promo = pillarPct(insights, pillars, 'p_promotion', 'Promotion');
  const promoOk = promo.pct >= 15;
  indicators.push({
    key: 'promotion',
    label: `${promo.name} Frequency`,
    level: promoOk ? 'Good' : 'Low',
    tone: promoOk ? 'good' : 'bad',
    detail: `${Math.round(promo.pct)}% of planned posts`,
  });
  if (!promoOk) {
    messages.push({ text: 'Consider adding more conversion-focused content.', covers: about(promo.name) });
    score -= 15;
  }

  const edu = pillarPct(insights, pillars, 'p_education', 'Education');
  const eduOk = edu.pct >= 15;
  indicators.push({
    key: 'education',
    label: `${edu.name} Frequency`,
    level: eduOk ? 'Good' : 'Low',
    tone: eduOk ? 'good' : 'bad',
    detail: `${Math.round(edu.pct)}% of planned posts`,
  });
  if (!eduOk) {
    messages.push({ text: 'Educational content is underrepresented.', covers: about(edu.name) });
    score -= 15;
  }

  return { score: Math.max(0, Math.min(100, score)), indicators, messages };
}
