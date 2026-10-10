import { useState } from 'react';
import { ArrowUpRight, Info, Link2, PencilLine } from 'lucide-react';
import { SOCIAL_PLATFORMS, type PostMetrics, type SocialPlatform } from '@shared/insights';
import { useInsights } from '@/store/insights';
import { ER_FORMULA, erOf, isEmptyMetrics, legacyToPostMetrics } from '@/lib/analytics';
import { fmtMetric, relativeTime } from '@/lib/insights';
import { cn, formatPct } from '@/lib/utils';
import { PLATFORM_COLORS } from '@/config/theme';
import { Tooltip } from '@/components/ui/Tooltip';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import type { ContentItem, ContentMetrics, PlatformMetricSet, PlatformPost } from '@/types';
import { useLinkPicker } from './PostPieces';

type Row = { label: string | ((p: SocialPlatform) => string); get: (m: PostMetrics) => number | null | undefined; kind?: 'pct' | 'seconds'; core?: boolean };

const ROWS: Row[] = [
  { label: 'Views', get: (m) => m.views, core: true },
  { label: 'Reach', get: (m) => m.reach, core: true },
  { label: 'Likes', get: (m) => m.likes, core: true },
  { label: 'Comments', get: (m) => m.comments, core: true },
  { label: 'Shares', get: (m) => m.shares, core: true },
  { label: (p) => (p === 'TikTok' ? 'Favorites' : 'Saves'), get: (m) => m.saves, core: true },
  { label: 'Engagement rate', get: (m) => erOf(m), kind: 'pct', core: true },
  { label: 'Total interactions', get: (m) => m.totalInteractions },
  { label: 'Profile visits', get: (m) => m.profileVisits },
  { label: 'Follows', get: (m) => m.follows },
  { label: 'Avg. watch time', get: (m) => m.avgWatchTime, kind: 'seconds' },
  { label: 'Total watch time', get: (m) => m.totalWatchTime, kind: 'seconds' },
  { label: 'Completion rate', get: (m) => m.completionRate, kind: 'pct' },
  { label: 'Skip rate', get: (m) => m.skipRate, kind: 'pct' },
  { label: 'Story replies', get: (m) => m.storyReplies },
];

const MANUAL_FIELDS: { key: keyof PostMetrics; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'reach', label: 'Reach' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'follows', label: 'Followers +' },
];

const LEGACY_FIELDS: { key: keyof ContentMetrics; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'reach', label: 'Reach' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'followersGained', label: 'Followers +' },
];

interface Props {
  draft: ContentItem;
  onPlatformMetrics: (next: ContentItem['platformMetrics']) => void;
  onLegacyMetrics: (next: ContentMetrics) => void;
}

/** IG vs TikTok side by side for one content item, plus manual input as a fallback. */
export function ContentInsights({ draft, onPlatformMetrics, onLegacyMetrics }: Props) {
  const posts = useInsights((s) => s.posts);
  const openPicker = useLinkPicker((s) => s.open);
  const [editing, setEditing] = useState<SocialPlatform | null>(null);

  const linked = posts.filter((p) => p.linkedContentId === draft.id && p.linkMethod !== 'none');
  const platforms = SOCIAL_PLATFORMS.filter(
    (p) => draft.platform.includes(p) || draft.platformMetrics[p] || linked.some((x) => x.platform === p),
  );
  const shown = platforms.length ? platforms : SOCIAL_PLATFORMS;

  const col = (p: SocialPlatform): { set?: PlatformMetricSet; post?: PlatformPost; values: PostMetrics } => {
    const set = draft.platformMetrics[p];
    const post = linked.find((x) => x.platform === p);
    return { set, post, values: set?.values ?? post?.metrics ?? {} };
  };
  const cols = shown.map((p) => ({ platform: p, ...col(p) }));
  const rows = ROWS.filter((r) => r.core || cols.some((c) => r.get(c.values) !== undefined));
  const traffic = cols.find((c) => c.values.trafficSources)?.values.trafficSources;
  const legacy = legacyToPostMetrics(draft.metrics);
  const hasLegacy = !isEmptyMetrics(legacy);

  const setManual = (p: SocialPlatform, key: keyof PostMetrics, raw: string) => {
    const cur = draft.platformMetrics[p];
    const base: PostMetrics = cur?.source === 'manual' ? cur.values : {};
    const n = raw === '' ? undefined : Math.max(0, Math.round(Number(raw) || 0));
    const values = { ...base, [key]: n };
    onPlatformMetrics({ ...draft.platformMetrics, [p]: { values, source: 'manual', mediaId: cur?.mediaId, permalink: cur?.permalink } });
  };

  return (
    <div className="space-y-3">
      <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[360px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-[#f3f5f0]">
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-ink-3">
                <span className="inline-flex items-center gap-1">
                  Metric
                  <Tooltip content={ER_FORMULA}>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3 w-3" />
                    </span>
                  </Tooltip>
                </span>
              </th>
              {cols.map((c) => {
                const link = c.set?.permalink || c.post?.permalink;
                return (
                  <th key={c.platform} className="px-3 py-2 text-right align-top">
                    <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                      <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_COLORS[c.platform] }} />
                      <PlatformIcon platform={c.platform} />
                      {c.platform}
                    </div>
                    <div className="mt-0.5 flex items-center justify-end gap-2 text-[10.5px] font-normal text-ink-4">
                      <SourceLabel set={c.set} post={c.post} />
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-ink-3 hover:text-ink">
                          Live post <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-b-0">
                <td className="px-3 py-1.5 text-ink-3">{typeof r.label === 'string' ? r.label : shown.length === 1 ? r.label(shown[0]) : 'Saves / Favorites'}</td>
                {cols.map((c) => {
                  const v = r.get(c.values);
                  return (
                    <td key={c.platform} className={cn('px-3 py-1.5 text-right tabular', v === undefined || v === null ? 'text-ink-4' : 'font-medium text-ink')}>
                      {fmtMetric(v, r.kind)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {traffic && (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">TikTok traffic sources</div>
          <div className="space-y-1.5">
            {Object.entries(traffic)
              .sort((a, b) => b[1] - a[1])
              .map(([name, pct]) => (
                <div key={name} className="flex items-center gap-2 text-[12px]">
                  <span className="w-20 shrink-0 text-ink-2">{name}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-muted">
                    <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: PLATFORM_COLORS.TikTok }} />
                  </span>
                  <span className="w-12 text-right text-ink tabular">{formatPct(pct)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((p) => {
          const post = linked.find((x) => x.platform === p);
          return (
            <div key={p} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditing((e) => (e === p ? null : p))}
                className={cn('inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[12px] font-medium', editing === p ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:bg-canvas')}
              >
                <PencilLine className="h-3 w-3" /> {p} manual input
              </button>
              {post && (
                <button type="button" onClick={() => openPicker(post.id)} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-3 hover:bg-muted hover:text-ink">
                  <Link2 className="h-3 w-3" /> Linked post
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="rounded-xl border border-line p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MANUAL_FIELDS.map((f) => {
              const set = draft.platformMetrics[editing];
              const v = set?.source === 'manual' ? set.values[f.key] : undefined;
              return (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-[11px] text-ink-3">{f.key === 'saves' && editing === 'TikTok' ? 'Favorites' : f.label}</span>
                  <input type="number" min={0} className="input tabular" value={typeof v === 'number' ? v : ''} placeholder="—" onChange={(e) => setManual(editing, f.key, e.target.value)} />
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink-4">
            {draft.platformMetrics[editing] && draft.platformMetrics[editing]!.source !== 'manual'
              ? 'Typing here switches this platform to manual numbers. The next sync will ask before replacing them.'
              : 'Use this when the API can’t provide numbers. A sync never overwrites manual numbers without asking.'}
          </p>
        </div>
      )}

      {hasLegacy && (
        <div className="rounded-xl border border-dashed border-line-strong p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Combined · old manual input</span>
            <span className="text-[11px] text-ink-4">ER {formatPct(erOf(legacy) ?? 0, 2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LEGACY_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[11px] text-ink-3">{f.label}</span>
                <input
                  type="number"
                  min={0}
                  className="input tabular"
                  value={draft.metrics[f.key] || ''}
                  placeholder="0"
                  onChange={(e) => onLegacyMetrics({ ...draft.metrics, [f.key]: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-4">Entered before per-platform metrics existed, for content on more than one platform. Kept as-is so nothing is lost.</p>
        </div>
      )}
    </div>
  );
}

function SourceLabel({ set, post }: { set?: PlatformMetricSet; post?: PlatformPost }) {
  if (set?.source === 'manual') return <span>{set.keepManual ? 'Manual (kept)' : 'Manual'}</span>;
  if (set?.source === 'mock' || post?.source === 'mock') return <span className="font-semibold text-amber-700">Demo</span>;
  if (set?.syncedAt || post?.syncedAt) return <span>Synced {relativeTime(set?.syncedAt ?? post?.syncedAt)}</span>;
  return <span>No data</span>;
}
