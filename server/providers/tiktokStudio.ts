import type { Page } from 'playwright-core';
import type { AccountDayInput, PostInput, PostMetrics } from '../../shared/insights.ts';
import { ApiError } from '../errors.ts';
import { addDaysUTC, todayUTC } from '../dates.ts';
import { debugDump, hasCookie, sleep, type Harvest } from '../browser/chrome.ts';
import { stripUndefined, toISO } from '../browser/extract.ts';
import { env, num } from './types.ts';
import { browserProvider } from './browserProvider.ts';

/**
 * TikTok Studio, read through the user's logged-in Chrome profile. We open
 * Studio once and call the same JSON endpoints its pages use (from inside the
 * page, so the session cookies and TikTok's request signing apply):
 *  - /tiktokstudio/api/web/user                → account id, username, creation date
 *  - /tiktokstudio/api/web/relation/...Count   → follower count now
 *  - /tiktok/creator/manage/item_list/v1/      → every post with lifetime stats (paged)
 *  - /aweme/v2/data/insight/                   → daily account history since the account was created
 *
 * Only these endpoints are read: scraping whole pages also picked up other
 * creators' videos from Studio's inspiration feeds.
 */

const LABEL = 'TikTok Studio';
const PAGE_SIZE = 50;
const MAX_PAGES = 200;
/** Days per insight request; one request covered 1000 days in testing. */
const HISTORY_CHUNK = 365;

/** Insight series → AccountDayInput field. */
const SERIES = {
  vv_history: 'views',
  pv_history: 'profileVisits',
  like_history: 'likes',
  comment_history: 'comments',
  share_history: 'shares',
  follower_num_history: 'followers',
  net_follower_history: 'netFollowers',
  reached_audience_history: 'reach',
} as const satisfies Record<string, keyof AccountDayInput>;

async function studioFetch(page: Page, path: string, init?: { method: string; body: string }): Promise<any> {
  const res = await page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(path, { credentials: 'include', ...(init ? { ...init, headers: { 'content-type': 'application/json' } } : {}) });
      return { status: r.status, text: await r.text() };
    },
    { path, init },
  );
  if (res.status === 401 || res.status === 403) throw new ApiError('token_expired', `${LABEL} login has expired. Click “Connect via browser” in Settings → Integrations.`);
  if (res.status === 429) throw new ApiError('rate_limited', `${LABEL} is rate limiting the session (too many requests).`, { retryAfter: 3600 });
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new ApiError('platform_error', `${LABEL} returned an unexpected page for ${path.split('?')[0]} (HTTP ${res.status}).`);
  }
  const code = json?.status_code ?? json?.statusCode ?? json?.BaseResp?.StatusCode;
  if (code === 8 || code === 10000) throw new ApiError('token_expired', `${LABEL} login has expired. Click “Connect via browser” in Settings → Integrations.`);
  if (code) throw new ApiError('platform_error', `${LABEL}: ${path.split('?')[0]} failed (${json.status_msg || json.statusMsg || code}).`);
  return json;
}

function toPost(item: any, username: string | undefined): PostInput | null {
  const id = String(item.item_id ?? '');
  const publishedAt = toISO(item.create_time ?? item.post_time);
  if (!/^\d{15,}$/.test(id) || !publishedAt) return null;
  const photo = item.item_type === 2 || (Array.isArray(item.photo_list) && item.photo_list.length > 0 && !item.duration);
  const metrics: PostMetrics = stripUndefined({
    views: num(item.play_count),
    likes: num(item.like_count),
    comments: num(item.comment_count),
    shares: num(item.share_count),
    saves: num(item.favorite_count),
  });
  return {
    platform: 'TikTok',
    mediaId: id,
    permalink: username ? `https://www.tiktok.com/@${username}/${photo ? 'photo' : 'video'}/${id}` : `https://www.tiktok.com/video/${id}`,
    type: photo ? 'Carousel' : 'Video',
    publishedAt,
    caption: item.desc ?? '',
    thumbnail: (Array.isArray(item.cover_url) ? item.cover_url[0] : item.cover_url) ?? '',
    metrics,
  };
}

async function readPosts(page: Page, username: string | undefined, raw: Harvest[]): Promise<PostInput[]> {
  const posts = new Map<string, PostInput>();
  let cursor = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = JSON.stringify({ cursor, size: PAGE_SIZE, query: { sort_orders: [{ field_name: 'post_time', order: 2 }], conditions: [], is_recent_posts: false } });
    const json = await studioFetch(page, '/tiktok/creator/manage/item_list/v1/?locale=en', { method: 'POST', body });
    raw.push({ url: 'item_list', json });
    for (const item of json.item_list ?? []) {
      const p = toPost(item, username);
      if (p) posts.set(p.mediaId, p);
    }
    if (!json.has_more || json.cursor === undefined || json.cursor === cursor) break;
    cursor = json.cursor;
    await sleep(700 + Math.random() * 700);
  }
  return [...posts.values()];
}

/**
 * Daily series from `since` to yesterday (today isn't final yet). With
 * tz_offset=0 the days are UTC days, like the rest of the server. A request
 * {days: S, end_days: E} returns one point per day from today-S to today-E.
 */
async function readHistory(page: Page, since: string, raw: Harvest[]): Promise<AccountDayInput[]> {
  const today = todayUTC();
  const total = Math.max(1, Math.round((Date.parse(today) - Date.parse(since)) / 86400_000));
  const byDate = new Map<string, AccountDayInput>();
  for (let end = 1; end <= total; end += HISTORY_CHUNK) {
    const start = Math.min(end + HISTORY_CHUNK - 1, total);
    const types = Object.keys(SERIES).map((t) => ({ insigh_type: t, days: start, end_days: end }));
    const json = await studioFetch(page, `/aweme/v2/data/insight/?locale=en&tz_offset=0&type_requests=${encodeURIComponent(JSON.stringify(types))}`);
    raw.push({ url: 'insight', json });
    const first = addDaysUTC(today, -start);
    for (const [series, field] of Object.entries(SERIES)) {
      const points: { status?: number; value?: unknown }[] = Array.isArray(json[series]) ? json[series] : [];
      points.forEach((pt, i) => {
        // status 2 = not available yet (recent days) / before the account existed.
        if (pt.status || num(pt.value) === undefined) return;
        const date = addDaysUTC(first, i);
        if (date < since) return;
        const day = byDate.get(date) ?? { platform: 'TikTok', date };
        (day as unknown as Record<string, unknown>)[field] = num(pt.value);
        byDate.set(date, day);
      });
    }
    await sleep(700 + Math.random() * 700);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const tiktokStudioProvider = browserProvider({
  platform: 'TikTok',
  mode: 'tiktok_studio',
  label: LABEL,
  loginUrls: ['https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Ftiktokstudio'],

  isLoggedIn: (ctx) => hasCookie(ctx, 'tiktok.com', 'sessionid'),

  async scrape(ctx) {
    const warnings: string[] = [];
    const raw: Harvest[] = [];
    const page = await ctx.newPage();
    await page.goto('https://www.tiktok.com/tiktokstudio', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined);
    // Studio's scripts install TikTok's request signing on fetch; give them a moment.
    await sleep(4000);
    if (!/tiktokstudio/.test(page.url())) throw new ApiError('token_expired', `${LABEL} login has expired. Click “Connect via browser” in Settings → Integrations.`);

    const user = await studioFetch(page, '/tiktokstudio/api/web/user?needIsVerified=true');
    const base = user.userBaseInfo?.UserProfile?.UserBase ?? {};
    const userId = String(user.userId ?? base.Id ?? '');
    const username = env('TIKTOK_USERNAME')?.replace(/^@/, '') || base.UniqId || undefined;
    const createdAt = toISO(base.CreateTime);

    let followersNow: number | undefined;
    try {
      const rel = await studioFetch(page, `/tiktokstudio/api/web/relation/multiGetFollowRelationCount?userId=${encodeURIComponent(userId)}&locale=en`);
      followersNow = num(rel.FollowerCount?.[userId]);
    } catch (err) {
      warnings.push(`${LABEL}: couldn't read the follower count (${err instanceof Error ? err.message : err}).`);
    }

    const posts = await readPosts(page, username, raw);
    const oldestPost = posts.reduce<string | undefined>((m, p) => (!m || p.publishedAt < m ? p.publishedAt : m), undefined);
    const historySince = (createdAt ?? oldestPost ?? addDaysUTC(todayUTC(), -365)).slice(0, 10);

    let days: AccountDayInput[] = [];
    try {
      days = await readHistory(page, historySince, raw);
    } catch (err) {
      warnings.push(`${LABEL}: daily account history failed (${err instanceof Error ? err.message : err}).`);
    }
    debugDump('TikTok', raw);

    if (!posts.length) warnings.push(`${LABEL}: no posts found on this account.`);
    warnings.push(`${LABEL}: watch time and completion rate per video aren't read yet; views, likes, comments, shares and saves are.`);
    return { accountName: username, accountId: userId, followersNow, posts, days, historySince, warnings };
  },
});
