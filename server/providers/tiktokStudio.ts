import type { Page } from 'playwright-core';
import type { PostInput, PostMetrics } from '../../shared/insights.ts';
import { debugDump, harvestJson, hasCookie, parseJsonish, scrollToLoad, sleep, type Harvest } from '../browser/chrome.ts';
import { mergeMetrics, percent, pick, seconds, str, stripUndefined, toISO, walk } from '../browser/extract.ts';
import { env } from './types.ts';
import { browserProvider } from './browserProvider.ts';

/**
 * TikTok Studio, read through the user's logged-in Chrome profile.
 * Sources, all fetched by the pages themselves while we browse:
 *  - tiktok.com/tiktokstudio/content  → per-video stats (+ watch time when shown)
 *  - tiktok.com/tiktokstudio/analytics → account overview
 *  - tiktok.com/@username             → follower count + video list fallback
 */

const LABEL = 'TikTok Studio';
const ID_KEYS = ['aweme_id', 'awemeId', 'item_id', 'itemId', 'id', 'video_id'];
const VIEW_KEYS = ['play_count', 'playCount', 'view_count', 'viewCount', 'vv', 'video_views', 'views'];

function cover(obj: Record<string, unknown>): string {
  const candidates = [obj.cover, obj.cover_url, obj.coverUrl, obj.cover_image_url, (obj.video as any)?.cover, (obj.video as any)?.origin_cover, (obj.video as any)?.originCover];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
    const list = (c as any)?.url_list ?? (c as any)?.urlList;
    if (Array.isArray(list) && typeof list[0] === 'string') return list[0];
  }
  return '';
}

function metricsOf(obj: Record<string, unknown>): PostMetrics {
  return stripUndefined<PostMetrics>({
    views: pick(obj, VIEW_KEYS),
    reach: pick(obj, ['reach', 'unique_viewers', 'reached_audience', 'reachedAudience']),
    likes: pick(obj, ['digg_count', 'diggCount', 'like_count', 'likeCount', 'likes']),
    comments: pick(obj, ['comment_count', 'commentCount', 'comments']),
    shares: pick(obj, ['share_count', 'shareCount', 'shares']),
    saves: pick(obj, ['collect_count', 'collectCount', 'favorite_count', 'favoriteCount', 'favorites']),
    follows: pick(obj, ['new_followers', 'newFollowers', 'follower_gain']),
    avgWatchTime: seconds(pick(obj, ['avg_watch_time', 'average_watch_time', 'avgWatchTime', 'avg_play_time', 'avg_time_watched'])),
    totalWatchTime: seconds(pick(obj, ['total_watch_time', 'totalWatchTime', 'total_play_time', 'total_time_watched'])),
    completionRate: percent(pick(obj, ['finish_rate', 'finishRate', 'full_video_watched_rate', 'completion_rate', 'completionRate'])),
  });
}

function extractPosts(harvest: Harvest[], username: string | undefined): PostInput[] {
  const byId = new Map<string, PostInput>();
  for (const h of harvest) {
    for (const obj of walk(h.json)) {
      const id = str(obj, ID_KEYS);
      if (!id || !/^\d{15,}$/.test(id)) continue;
      if (pick(obj, VIEW_KEYS) === undefined && pick(obj, ['digg_count', 'diggCount']) === undefined) continue;
      const metrics = metricsOf(obj);
      const prev = byId.get(id);
      if (prev) {
        prev.metrics = mergeMetrics(prev.metrics, metrics);
        prev.caption ||= str(obj, ['desc', 'description', 'title', 'video_description']) ?? '';
        prev.thumbnail ||= cover(obj);
        if (!prev.publishedAt) prev.publishedAt = toISO(obj.create_time ?? obj.createTime ?? obj.publish_time ?? obj.post_time) ?? '';
        continue;
      }
      byId.set(id, {
        platform: 'TikTok',
        mediaId: id,
        permalink: username ? `https://www.tiktok.com/@${username}/video/${id}` : `https://www.tiktok.com/video/${id}`,
        type: 'Video',
        publishedAt: toISO(obj.create_time ?? obj.createTime ?? obj.publish_time ?? obj.post_time) ?? '',
        caption: str(obj, ['desc', 'description', 'title', 'video_description']) ?? '',
        thumbnail: cover(obj),
        metrics,
      });
    }
  }
  return [...byId.values()].filter((p) => p.publishedAt);
}

function findAccount(harvest: Harvest[], hint?: string): { username?: string; followers?: number; id?: string } {
  let best: { username?: string; followers?: number; id?: string } = {};
  for (const h of harvest) {
    for (const obj of walk(h.json)) {
      const username = str(obj, ['unique_id', 'uniqueId', 'username']);
      if (!username || /\s/.test(username)) continue;
      if (hint && username.toLowerCase() !== hint.toLowerCase()) continue;
      const followers = pick(obj, ['follower_count', 'followerCount', 'fans', 'fans_count']);
      if (followers === undefined && best.username) continue;
      if (followers !== undefined || !best.username) best = { username, followers: followers ?? best.followers, id: str(obj, ['uid', 'id', 'user_id']) };
    }
  }
  return best;
}

async function rehydrationData(page: Page, sink: Harvest[]) {
  const text = await page
    .locator('script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE')
    .first()
    .textContent({ timeout: 5000 })
    .catch(() => null);
  if (text) for (const json of parseJsonish(text)) sink.push({ url: page.url(), json });
}

async function visit(page: Page, url: string, scrolls: number) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await sleep(2000);
  await scrollToLoad(page, scrolls);
}

export const tiktokStudioProvider = browserProvider({
  platform: 'TikTok',
  mode: 'tiktok_studio',
  label: LABEL,
  loginUrls: ['https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Ftiktokstudio'],

  isLoggedIn: (ctx) => hasCookie(ctx, 'tiktok.com', 'sessionid'),

  async scrape(ctx) {
    const harvest: Harvest[] = [];
    const warnings: string[] = [];
    const page = await ctx.newPage();
    await harvestJson(page, (u) => /tiktok\.com\//.test(u) && !/\.(js|css|png|jpe?g|webp|woff2?)(\?|$)/.test(u), harvest);

    await visit(page, 'https://www.tiktok.com/tiktokstudio/content', 8);
    await visit(page, 'https://www.tiktok.com/tiktokstudio/analytics', 1);

    const hint = env('TIKTOK_USERNAME')?.replace(/^@/, '');
    let account = findAccount(harvest, hint);
    const username = hint ?? account.username;
    if (username) {
      await visit(page, `https://www.tiktok.com/@${username}`, 6);
      await rehydrationData(page, harvest);
      account = { ...account, ...findAccount(harvest, username) };
    } else {
      warnings.push(`${LABEL}: couldn't detect your username. Set TIKTOK_USERNAME in .env to read followers.`);
    }

    debugDump('TikTok', harvest);
    const posts = extractPosts(harvest, username);
    if (!posts.length) warnings.push(`${LABEL}: no videos found. Run once with SCRAPE_DEBUG=true in .env and check server/.data/scrape-debug.`);
    if (posts.length && posts.every((p) => p.metrics.avgWatchTime === undefined)) {
      warnings.push(`${LABEL}: watch time / completion rate weren't on the pages we read; views, likes, comments, shares and saves are.`);
    }
    return { accountName: username, accountId: account.id, followersNow: account.followers, posts, warnings };
  },
});
