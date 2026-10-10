import { useMemo } from 'react';
import type { SocialPlatform } from '@shared/insights';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useInsights } from '@/store/insights';
import {
  accountKpis,
  buildPostRows,
  combineKpis,
  platformsOf,
  previousPeriod,
  resolvePeriod,
  rowsIn,
  snapshotsFor,
  type AccountKpis,
} from '@/lib/insights';

/** Everything the Dashboard / Performance insight sections need, for the current platform + period. */
export function useInsightsData() {
  const platformFilter = useUI((s) => s.insightsPlatform);
  const periodKind = useUI((s) => s.insightsPeriod);
  const custom = useUI((s) => s.insightsCustom);
  const snapshots = useInsights((s) => s.snapshots);
  const posts = useInsights((s) => s.posts);
  const status = useInsights((s) => s.status);
  const syncing = useInsights((s) => s.sync.Instagram.syncing || s.sync.TikTok.syncing);
  const contents = useWorkspace((s) => s.contents);

  return useMemo(() => {
    const period = resolvePeriod(periodKind, custom);
    const prev = previousPeriod(period);
    const platforms = platformsOf(platformFilter);
    const kpisBy: Partial<Record<SocialPlatform, AccountKpis>> = {};
    const prevKpisBy: Partial<Record<SocialPlatform, AccountKpis>> = {};
    for (const p of platforms) {
      kpisBy[p] = accountKpis(snapshotsFor(snapshots, p, period));
      prevKpisBy[p] = accountKpis(snapshotsFor(snapshots, p, prev));
    }
    const kpis = combineKpis(platforms.map((p) => kpisBy[p]!));
    const prevKpis = combineKpis(platforms.map((p) => prevKpisBy[p]!));
    const allRows = buildPostRows(posts, contents);
    const rows = rowsIn(allRows, platforms, period);
    const prevRows = rowsIn(allRows, platforms, prev);
    const hasAnyData = snapshots.length > 0 || posts.length > 0;
    return { period, prev, platforms, platformFilter, kpis, prevKpis, kpisBy, prevKpisBy, allRows, rows, prevRows, snapshots, hasAnyData, syncing, loading: status !== 'ready' || (!hasAnyData && syncing) };
  }, [platformFilter, periodKind, custom, snapshots, posts, contents, status, syncing]);
}
