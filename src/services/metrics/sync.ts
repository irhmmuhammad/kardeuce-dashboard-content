import type { AccountDayInput, PostInput, PostMetrics, SocialPlatform } from '@shared/insights';
import type { AccountSnapshot, ContentItem, DataSource, PlatformMetricSet, PlatformPost } from '@/types';
import { addDays, todayISO } from '@/lib/date';
import { isEmptyMetrics } from '@/lib/analytics';
import type { MetricsProvider } from './types';
import { isMockPost, MOCK_WINDOW_DAYS } from './mock';

export const AUTO_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;
const INSIGHTS_CHUNK = 25;

export interface PlatformSyncResult {
  platform: SocialPlatform;
  snapshots: AccountSnapshot[];
  posts: PlatformPost[];
  /** Readable notes: metrics the API couldn't return, clamped ranges… */
  warnings: string[];
  /** Steps that failed. Empty = full success. */
  errors: string[];
  /** `posts` is the account's complete post list: posts not in it no longer exist (or were never the account's). */
  postsComplete?: boolean;
}

const snapshotId = (platform: SocialPlatform, date: string) => `${platform}:${date}`;
export const postId = (platform: SocialPlatform, mediaId: string) => `${platform}:${mediaId}`;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Turn API days into snapshots and rebuild follower history.
 * Instagram only reports today's follower count, so earlier days are derived
 * by walking back with the daily net change (marked as estimated). A value the
 * API reported directly is never replaced by an estimate.
 */
export function buildSnapshots(
  platform: SocialPlatform,
  days: AccountDayInput[],
  followersNow: number | undefined,
  existing: AccountSnapshot[],
  source: DataSource,
  syncedAt: string,
): AccountSnapshot[] {
  const prev = new Map(existing.map((s) => [s.date, s]));
  const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date));
  const out = sorted.map<AccountSnapshot>((d) => {
    const old = prev.get(d.date);
    const snap: AccountSnapshot = {
      ...old,
      ...stripUndefined(d),
      id: snapshotId(platform, d.date),
      date: d.date,
      platform,
      source,
      syncedAt,
    };
    if (d.followers !== undefined) snap.followersEstimated = false;
    else if (old?.followers !== undefined) {
      snap.followers = old.followers;
      snap.followersEstimated = old.followersEstimated;
    }
    return snap;
  });

  const today = todayISO();
  const last = out[out.length - 1];
  if (followersNow !== undefined && last && last.date === today && (last.followers === undefined || last.followersEstimated)) {
    last.followers = followersNow;
    last.followersEstimated = false;
  }
  // Walk backwards: followers[d-1] = followers[d] - net[d].
  for (let i = out.length - 2; i >= 0; i--) {
    const next = out[i + 1];
    const cur = out[i];
    if ((cur.followers === undefined || cur.followersEstimated) && next.followers !== undefined && next.netFollowers !== undefined) {
      cur.followers = next.followers - next.netFollowers;
      cur.followersEstimated = true;
    }
  }
  return out;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function mergeMetrics(base: PostMetrics, extra: PostMetrics | undefined): PostMetrics {
  return { ...base, ...stripUndefined(extra ?? {}) };
}

/** Sync one platform. Never throws: failures are reported per step. */
export async function syncPlatform(
  provider: MetricsProvider,
  existingSnapshots: AccountSnapshot[],
  existingPosts: PlatformPost[],
): Promise<PlatformSyncResult> {
  const platform = provider.platform;
  const source: DataSource = provider.kind === 'mock' ? 'mock' : 'api';
  const syncedAt = new Date().toISOString();
  const today = todayISO();
  const windowStart = addDays(today, -(MOCK_WINDOW_DAYS - 1));
  const result: PlatformSyncResult = { platform, snapshots: [], posts: [], warnings: [], errors: [] };

  // Account: backfill 90 days on first sync, then only the last few days (platforms revise ~48h).
  const own = existingSnapshots.filter((s) => s.platform === platform && s.source === source);
  const latest = own.reduce<string | null>((m, s) => (!m || s.date > m ? s.date : m), null);
  // Full-history sources are cached on the server, so re-reading everything each sync is cheap.
  const history = provider.fullHistorySince;
  const recentSince = latest && latest > windowStart ? addDays(latest, -3) : windowStart;
  const accountSince = history ?? (recentSince < windowStart ? windowStart : recentSince);
  try {
    const res = await provider.getAccountInsights({ since: accountSince, until: today });
    result.snapshots = buildSnapshots(platform, res.days, res.followersNow, own, source, syncedAt);
    result.warnings.push(...res.warnings);
  } catch (err) {
    result.errors.push(`Account insights: ${errorText(err)}`);
  }

  // Posts in the last 90 days (or all of them), refreshed every sync (numbers keep growing after posting).
  let listed: PostInput[] = [];
  try {
    const res = await provider.listMedia({ since: history ?? windowStart, until: today });
    listed = res.posts;
    result.postsComplete = !!history && listed.length > 0;
    result.warnings.push(...res.warnings);
  } catch (err) {
    result.errors.push(`Post list: ${errorText(err)}`);
    return result;
  }

  const insights: Record<string, PostMetrics> = {};
  if (!provider.listIncludesInsights && listed.length) {
    for (let i = 0; i < listed.length; i += INSIGHTS_CHUNK) {
      const chunk = listed.slice(i, i + INSIGHTS_CHUNK);
      try {
        const res = await provider.getMediaInsights(chunk.map((p) => ({ mediaId: p.mediaId, type: p.type })));
        Object.assign(insights, res.metrics);
        result.warnings.push(...res.warnings);
      } catch (err) {
        result.errors.push(`Post insights (${chunk.length} posts): ${errorText(err)}`);
        // Rate limited: stop hammering the API, keep what we have.
        if (/rate|limit|429/i.test(errorText(err))) break;
      }
    }
  }

  const prevPosts = new Map(existingPosts.map((p) => [p.id, p]));
  result.posts = listed.map((p) => {
    const id = postId(platform, p.mediaId);
    const old = prevPosts.get(id);
    return {
      id,
      platform,
      mediaId: p.mediaId,
      permalink: p.permalink,
      type: p.type,
      publishedAt: p.publishedAt,
      caption: p.caption,
      thumbnail: p.thumbnail,
      // Failed insight calls fall back to the last known numbers.
      metrics: mergeMetrics(mergeMetrics(old?.metrics ?? {}, p.metrics), insights[p.mediaId]),
      linkedContentId: old?.linkedContentId,
      linkMethod: old?.linkMethod,
      demoPillar: isMockPost(p) ? p.demoPillar : undefined,
      demoFormat: isMockPost(p) ? p.demoFormat : undefined,
      source,
      syncedAt,
    };
  });
  result.warnings = Array.from(new Set(result.warnings));
  return result;
}

/* ---------------- Applying synced numbers to content ---------------- */

export interface MetricConflict {
  contentId: string;
  contentTitle: string;
  platform: SocialPlatform;
  manual: PostMetrics;
  synced: PostMetrics;
  post: PlatformPost;
}

const COMPARE_KEYS: (keyof PostMetrics)[] = ['views', 'reach', 'likes', 'comments', 'shares', 'saves'];

function sameNumbers(a: PostMetrics, b: PostMetrics): boolean {
  return COMPARE_KEYS.every((k) => a[k] === undefined || b[k] === undefined || a[k] === b[k]);
}

export function syncedSet(post: PlatformPost): PlatformMetricSet {
  return { values: post.metrics, source: post.source, mediaId: post.mediaId, permalink: post.permalink, syncedAt: post.syncedAt };
}

/**
 * Copy linked posts' numbers onto their content items.
 * Manual numbers are never overwritten silently: differing values become
 * conflicts for the team to resolve, and "keep manual" is remembered.
 */
export function applyPostsToContents(
  posts: PlatformPost[],
  contents: ContentItem[],
): { updates: { id: string; platformMetrics: ContentItem['platformMetrics'] }[]; conflicts: MetricConflict[] } {
  const byContent = new Map<string, PlatformPost[]>();
  for (const p of posts) {
    if (!p.linkedContentId || p.linkMethod === 'none') continue;
    byContent.set(p.linkedContentId, [...(byContent.get(p.linkedContentId) ?? []), p]);
  }
  const updates: { id: string; platformMetrics: ContentItem['platformMetrics'] }[] = [];
  const conflicts: MetricConflict[] = [];

  for (const c of contents) {
    const linked = byContent.get(c.id) ?? [];
    const next = { ...c.platformMetrics };
    let changed = false;

    // Synced sets whose post is no longer linked here are removed.
    for (const [platform, set] of Object.entries(next) as [SocialPlatform, PlatformMetricSet | undefined][]) {
      if (!set || set.source === 'manual') continue;
      if (!linked.some((p) => p.platform === platform && p.mediaId === set.mediaId)) {
        delete next[platform];
        changed = true;
      }
    }

    for (const post of linked) {
      const cur = next[post.platform];
      if (cur?.source === 'manual' && !isEmptyMetrics(cur.values)) {
        if (cur.keepManual) {
          if (cur.mediaId !== post.mediaId) {
            next[post.platform] = { ...cur, mediaId: post.mediaId, permalink: post.permalink };
            changed = true;
          }
          continue;
        }
        if (!sameNumbers(cur.values, post.metrics)) {
          conflicts.push({ contentId: c.id, contentTitle: c.title, platform: post.platform, manual: cur.values, synced: post.metrics, post });
          continue;
        }
      }
      const set = syncedSet(post);
      if (JSON.stringify(cur) !== JSON.stringify(set)) {
        next[post.platform] = set;
        changed = true;
      }
    }
    if (changed) updates.push({ id: c.id, platformMetrics: next });
  }
  return { updates, conflicts };
}

export function isStale(lastSyncAt: string | undefined): boolean {
  if (!lastSyncAt) return true;
  return Date.now() - new Date(lastSyncAt).getTime() > AUTO_SYNC_AFTER_MS;
}
