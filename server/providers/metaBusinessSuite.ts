import type { BrowserContext, Page } from 'playwright-core';
import type { PostInput, PostMetrics, PostType } from '../../shared/insights.ts';
import { ApiError } from '../errors.ts';
import { debugDump, harvestJson, hasCookie, scrollToLoad, sleep, type Harvest } from '../browser/chrome.ts';
import { mergeMetrics, pick, str, stripUndefined, toISO, walk } from '../browser/extract.ts';
import { env, num } from './types.ts';
import { browserProvider } from './browserProvider.ts';

/**
 * Instagram, read through the user's logged-in Chrome profile (no token):
 *  1. instagram.com web endpoints (the same ones the website calls) → profile,
 *     follower count, posts with likes / comments / plays.
 *  2. Meta Business Suite → Insights → Content (optional, needs the Facebook
 *     login in the same window) → reach, saves, shares, views per post.
 */

const LABEL = 'Meta Business Suite';
/** Public app id of the instagram.com web client; the site sends it on every API call. */
const IG_WEB_APP_ID = '936619743392459';
const MAX_FEED_PAGES = 8;
const FEED_DAYS = 180;

async function igFetch(page: Page, path: string): Promise<any> {
  const res = await page.evaluate(
    async ({ path, appId }) => {
      const csrf = (globalThis as any).document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';
      const r = await fetch(path, { credentials: 'include', headers: { 'x-ig-app-id': appId, 'x-csrftoken': csrf, 'x-requested-with': 'XMLHttpRequest' } });
      return { status: r.status, text: await r.text() };
    },
    { path, appId: IG_WEB_APP_ID },
  );
  if (res.status === 401 || res.status === 403) throw new ApiError('token_expired', 'Instagram login has expired. Click “Connect via browser” in Settings → Integrations.');
  if (res.status === 429) throw new ApiError('rate_limited', 'Instagram is rate limiting the web session. Try again in an hour.', { retryAfter: 3600 });
  try {
    return JSON.parse(res.text);
  } catch {
    throw new ApiError('platform_error', `Instagram returned an unexpected page for ${path.split('?')[0]} (HTTP ${res.status}).`);
  }
}

function postType(item: any): PostType {
  if (item.product_type === 'clips' || item.product_type === 'igtv') return 'Reels';
  if (item.media_type === 8) return 'Carousel';
  if (item.media_type === 2) return 'Reels';
  return 'Static';
}

function toPost(item: any): PostInput | null {
  const id = String(item.pk ?? item.id ?? '').split('_')[0];
  const publishedAt = toISO(item.taken_at);
  if (!id || !publishedAt) return null;
  const type = postType(item);
  const thumb = item.image_versions2?.candidates?.[0]?.url ?? item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ?? '';
  const likes = item.like_and_view_counts_disabled ? undefined : num(item.like_count);
  const metrics: PostMetrics = stripUndefined({
    likes,
    comments: num(item.comment_count),
    views: num(item.ig_play_count ?? item.play_count ?? item.view_count),
    shares: num(item.reshare_count ?? item.share_count),
  });
  return {
    platform: 'Instagram',
    mediaId: id,
    permalink: `https://www.instagram.com/${type === 'Reels' ? 'reel' : 'p'}/${item.code}/`,
    type,
    publishedAt,
    caption: item.caption?.text ?? '',
    thumbnail: thumb,
    metrics,
  };
}

async function readInstagram(page: Page, warnings: string[]) {
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined);
  await sleep(2500);

  let username = env('INSTAGRAM_USERNAME')?.replace(/^@/, '');
  if (!username) {
    const form = await igFetch(page, '/api/v1/accounts/edit/web_form_data/').catch(() => null);
    username = form?.form_data?.username;
  }
  if (!username) throw new ApiError('platform_error', 'Could not read your Instagram username. Set INSTAGRAM_USERNAME in .env.');

  const profile = await igFetch(page, `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
  const user = profile?.data?.user ?? {};
  const followersNow = num(user.edge_followed_by?.count);

  const posts: PostInput[] = [];
  const oldest = Date.now() - FEED_DAYS * 86400_000;
  let maxId: string | undefined;
  for (let i = 0; i < MAX_FEED_PAGES; i++) {
    const feed = await igFetch(page, `/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=33${maxId ? `&max_id=${maxId}` : ''}`);
    for (const item of feed.items ?? []) {
      const p = toPost(item);
      if (p) posts.push(p);
    }
    const last = posts[posts.length - 1];
    if (!feed.more_available || !feed.next_max_id || (last && Date.parse(last.publishedAt) < oldest)) break;
    maxId = feed.next_max_id;
    await sleep(1500 + Math.random() * 1500);
  }
  if (!posts.length) warnings.push('Instagram: no posts were returned for this account.');
  return { username, userId: str(user, ['id']), followersNow, posts };
}

/** Business Suite → Insights → Content: match rows to our posts by id or shortcode. */
async function readBusinessSuite(ctx: BrowserContext, posts: PostInput[], warnings: string[]) {
  if (!(await hasCookie(ctx, 'facebook.com', 'c_user'))) {
    warnings.push(`${LABEL}: not logged in to Facebook, so reach / saves / shares are missing. Connect again and log in to Business Suite in the second tab.`);
    return;
  }
  const harvest: Harvest[] = [];
  const page = await ctx.newPage();
  await harvestJson(page, (u) => /facebook\.com\/(api\/graphql|ajax)/.test(u), harvest);
  await page.goto('https://business.facebook.com/latest/insights/content', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => undefined);
  await sleep(3000);
  await scrollToLoad(page, 6, 2000);
  debugDump('Instagram', harvest);

  const byKey = new Map<string, PostInput>();
  for (const p of posts) {
    byKey.set(p.mediaId, p);
    const code = p.permalink.match(/\/(?:p|reel)\/([^/]+)/)?.[1];
    if (code) byKey.set(code, p);
  }
  let matched = 0;
  for (const h of harvest) {
    for (const obj of walk(h.json)) {
      let post: PostInput | undefined;
      for (const v of Object.values(obj)) {
        if (typeof v !== 'string' && typeof v !== 'number') continue;
        const s = String(v);
        post = byKey.get(s) ?? byKey.get(s.match(/instagram\.com\/(?:p|reel)\/([^/?]+)/)?.[1] ?? '');
        if (post) break;
      }
      if (!post) continue;
      const m: PostMetrics = stripUndefined({
        reach: pick(obj, ['reach', 'post_reach', 'accounts_reached']),
        views: pick(obj, ['views', 'video_views', 'plays', 'impressions']),
        saves: pick(obj, ['saves', 'saved', 'save_count']),
        shares: pick(obj, ['shares', 'share_count']),
        totalInteractions: pick(obj, ['total_interactions', 'interactions', 'engagement']),
        profileVisits: pick(obj, ['profile_visits', 'profile_activity']),
        follows: pick(obj, ['follows', 'follower_gain']),
      });
      if (Object.keys(m).length) {
        post.metrics = mergeMetrics(post.metrics, m);
        matched++;
      }
    }
  }
  await page.close().catch(() => undefined);
  if (!matched) {
    warnings.push(`${LABEL}: opened Insights but couldn't match any posts (the page layout may have changed). Run with SCRAPE_DEBUG=true and check server/.data/scrape-debug.`);
  }
}

export const metaBusinessSuiteProvider = browserProvider({
  platform: 'Instagram',
  mode: 'meta_business_suite',
  label: LABEL,
  loginUrls: ['https://www.instagram.com/accounts/login/', 'https://business.facebook.com/latest/insights/content'],

  isLoggedIn: (ctx) => hasCookie(ctx, 'instagram.com', 'sessionid'),

  async scrape(ctx) {
    const warnings: string[] = [];
    const page = await ctx.newPage();
    const ig = await readInstagram(page, warnings);
    await page.close().catch(() => undefined);
    await readBusinessSuite(ctx, ig.posts, warnings);
    return { accountName: ig.username, accountId: ig.userId, followersNow: ig.followersNow, posts: ig.posts, warnings };
  },
});
