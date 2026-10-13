/**
 * Instagram for the hosted dashboard, without the local server: reads the
 * official Instagram API (Instagram Login) and caches the result in Upstash
 * Redis. Any visit refreshes it when it is older than REFRESH_AFTER_MS.
 * Account history goes back to the first post (Instagram keeps 2 years).
 *
 *   GET /api/instagram-data          → { integration, scrape } (scrape = ScrapeResult shape)
 *   GET /api/instagram-data?force=1  → refresh now (still at most once a minute)
 *
 * vercel.json also runs it once a day (Vercel Cron, ~08:00 WIB), so the
 * numbers, the follower history and the token stay current with no visits.
 *
 * Setup (Vercel → Settings → Environment Variables): IG_ACCESS_TOKEN = the
 * long-lived token from the Meta app (API setup with Instagram login). The
 * token is refreshed here and the new one kept in Redis; it never leaves the
 * server. Self-contained on purpose: Vercel bundles this file on its own.
 */

export const maxDuration = 120;

const GRAPH = `https://graph.instagram.com/${process.env.IG_GRAPH_VERSION ?? 'v26.0'}`;
const DAY_MS = 86_400_000;
/** A visit after this refreshes the numbers first. */
const REFRESH_AFTER_MS = 15 * 60_000;
const FORCE_MIN_GAP_MS = 60_000;
/** Instagram keeps account insights for 2 years; history starts at the first post (or 2 years back). */
const MAX_HISTORY_DAYS = 729;
/** Missing days read per refresh (2 calls each): a new account's backlog fills over a few refreshes. */
const BACKFILL_PER_REFRESH = 150;
/** Days refetched every time (Instagram revises recent days). */
const RECENT_DAYS = 3;
/** Posts younger than this get fresh insights on every refresh, older ones once a day. */
const HOT_POST_MS = 30 * DAY_MS;
const CONCURRENCY = 5;

const ACCOUNT_METRICS = ['views', 'reach', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_links_taps'];
const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count';
const BASE_MEDIA_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];
const METRICS_BY_TYPE: Record<'reels' | 'feed' | 'story', string[]> = {
  reels: [...BASE_MEDIA_METRICS, 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate'],
  feed: [...BASE_MEDIA_METRICS, 'profile_visits', 'follows'],
  story: ['views', 'reach', 'shares', 'total_interactions', 'profile_visits', 'follows', 'replies'],
};

const KEY = { token: 'ig:token', data: 'ig:data', lock: 'ig:lock' };

type Metrics = Record<string, number | Record<string, number>>;
type PostType = 'Reels' | 'Carousel' | 'Static' | 'Story' | 'Video';

interface Post {
  platform: 'Instagram';
  mediaId: string;
  permalink: string;
  type: PostType;
  publishedAt: string;
  caption: string;
  thumbnail: string;
  metrics: Metrics;
}

interface Day {
  platform: 'Instagram';
  date: string;
  [metric: string]: string | number | undefined;
}

interface Cache {
  scrapedAt: string;
  accountName?: string;
  followersNow?: number;
  followersByDay: Record<string, number>;
  days: Record<string, Day>;
  posts: Post[];
  /** mediaId → when its insights were last read (ISO). */
  insightsAt: Record<string, string>;
  /** First day of the account history (first post, at most 2 years back). */
  historySince?: string;
  /** Last failed refresh: shown in Settings, and the next try waits REFRESH_AFTER_MS like a success. */
  error?: string;
  failedAt?: string;
}

interface Token {
  accessToken: string;
  issuedAt: string;
  expiresAt?: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly igCode?: number,
  ) {
    super(message);
  }
}

/* ---------------- Redis (Upstash REST) ---------------- */

async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  const url = (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL)?.replace(/\/+$/, '');
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new HttpError(503, 'Shared storage is not set up: connect Upstash for Redis to this Vercel project.');
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new HttpError(502, `Shared storage error (HTTP ${res.status}).`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const failed = out.find((r) => r.error);
  if (failed) throw new HttpError(502, `Shared storage error: ${failed.error}`);
  return out.map((r) => r.result);
}

const parse = <T>(v: unknown): T | undefined => (typeof v === 'string' ? (JSON.parse(v) as T) : undefined);

/* ---------------- Instagram API ---------------- */

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

async function ig(path: string, params: Record<string, string | number>, accessToken: string): Promise<any> {
  const u = new URL(path.startsWith('http') ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', accessToken);
  let res: Response;
  try {
    res = await fetch(u);
  } catch (err) {
    throw new HttpError(502, `Could not reach Instagram: ${err instanceof Error ? err.message : err}`);
  }
  const body = (await res.json().catch(() => ({}))) as any;
  if (res.ok && !body?.error) return body;
  const code = Number(body?.error?.code);
  const msg = `Instagram: ${body?.error?.error_user_msg || body?.error?.message || `HTTP ${res.status}`}`;
  if (code === 190 || res.status === 401) throw new HttpError(401, `${msg}. The token is invalid or expired: generate a new one and update IG_ACCESS_TOKEN in Vercel.`, code);
  if (res.status === 429 || [4, 17, 32, 613, 80002].includes(code)) throw new HttpError(429, `${msg}. Instagram is rate-limiting this app; try again later.`, code);
  throw new HttpError(502, msg, code);
}

/** Runs `fn` over `items` with a few requests in flight. */
async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

async function currentToken(): Promise<Token> {
  const [stored] = await redis([['GET', KEY.token]]);
  const env = process.env.IG_ACCESS_TOKEN?.trim();
  let token = parse<Token & { source?: string }>(stored);
  // A new token pasted into Vercel replaces the one we've been refreshing.
  if (env && (!token || token.source !== env)) token = { accessToken: env, issuedAt: new Date(Date.now() - DAY_MS).toISOString(), source: env };
  if (!token) throw new HttpError(503, 'Instagram is not set up on the website: add IG_ACCESS_TOKEN in Vercel → Settings → Environment Variables, then redeploy.');

  // Long-lived tokens last 60 days; refreshing (allowed after 24h) restarts that.
  const age = Date.now() - Date.parse(token.issuedAt);
  const left = token.expiresAt ? Date.parse(token.expiresAt) - Date.now() : 0;
  if (age > DAY_MS && left < 50 * DAY_MS) {
    try {
      const r = await ig('https://graph.instagram.com/refresh_access_token', { grant_type: 'ig_refresh_token' }, token.accessToken);
      token = {
        ...token,
        accessToken: r.access_token ?? token.accessToken,
        issuedAt: new Date().toISOString(),
        expiresAt: num(r.expires_in) ? new Date(Date.now() + num(r.expires_in)! * 1000).toISOString() : token.expiresAt,
      };
      await redis([['SET', KEY.token, JSON.stringify(token)]]);
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) throw err;
      // Best effort: the current token may still work.
    }
  }
  return token;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

async function readDay(accountId: string, date: string, accessToken: string): Promise<Day> {
  const window = { since: dayStart(date), until: dayStart(date) + 86_400 };
  const row: Day = { platform: 'Instagram', date };
  const body = await ig(`/${accountId}/insights`, { metric: ACCOUNT_METRICS.join(','), period: 'day', metric_type: 'total_value', ...window }, accessToken);
  const val = (name: string) => {
    const m = (body.data as any[] | undefined)?.find((d) => d.name === name);
    return num(m?.total_value?.value ?? m?.values?.[0]?.value);
  };
  Object.assign(row, {
    views: val('views'),
    reach: val('reach'),
    accountsEngaged: val('accounts_engaged'),
    interactions: val('total_interactions'),
    likes: val('likes'),
    comments: val('comments'),
    shares: val('shares'),
    saves: val('saves'),
    linkClicks: val('profile_links_taps'),
  });
  try {
    const f = await ig(`/${accountId}/insights`, { metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', ...window }, accessToken);
    const m = (f.data as any[] | undefined)?.find((d) => d.name === 'follows_and_unfollows');
    const results: any[] = m?.total_value?.breakdowns?.[0]?.results ?? [];
    let net = results.length ? 0 : num(m?.total_value?.value);
    for (const r of results) {
      const dim = String((r.dimension_values ?? []).join(' ')).toUpperCase();
      net = (net ?? 0) + (dim.includes('UNFOLLOW') || dim.includes('NON_FOLLOWER') ? -1 : 1) * (num(r.value) ?? 0);
    }
    if (net !== undefined) row.netFollowers = net;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 429)) throw err;
    // Needs 100+ followers; leave it out.
  }
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
  return row;
}

function postType(m: any): PostType {
  const product = String(m.media_product_type ?? '').toUpperCase();
  if (product === 'STORY') return 'Story';
  if (product === 'REELS' || String(m.permalink ?? '').includes('/reel/')) return 'Reels';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'Carousel';
  if (m.media_type === 'IMAGE') return 'Static';
  return 'Video';
}

function toPost(m: any): Post {
  const metrics: Metrics = {};
  if (num(m.like_count) !== undefined) metrics.likes = num(m.like_count)!;
  if (num(m.comments_count) !== undefined) metrics.comments = num(m.comments_count)!;
  return {
    platform: 'Instagram',
    mediaId: String(m.id),
    permalink: m.permalink ?? '',
    type: postType(m),
    publishedAt: m.timestamp,
    caption: m.caption ?? '',
    thumbnail: m.thumbnail_url || m.media_url || '',
    metrics,
  };
}

async function postInsights(post: Post, accessToken: string): Promise<Metrics> {
  const kind = post.type === 'Reels' ? 'reels' : post.type === 'Story' ? 'story' : 'feed';
  let body: any;
  try {
    body = await ig(`/${post.mediaId}/insights`, { metric: METRICS_BY_TYPE[kind].join(',') }, accessToken);
  } catch (err) {
    // A metric this media doesn't support (code 100): retry with the safe set.
    if (!(err instanceof HttpError && err.igCode === 100)) throw err;
    body = await ig(`/${post.mediaId}/insights`, { metric: (kind === 'story' ? METRICS_BY_TYPE.story : BASE_MEDIA_METRICS).join(',') }, accessToken);
  }
  const v = (name: string) => {
    const m = (body.data as any[] | undefined)?.find((d) => d.name === name);
    return num(m?.values?.[0]?.value ?? m?.total_value?.value);
  };
  const ms = (name: string) => (v(name) === undefined ? undefined : v(name)! / 1000);
  const out: Record<string, number | undefined> = {
    views: v('views'),
    reach: v('reach'),
    likes: v('likes'),
    comments: v('comments'),
    shares: v('shares'),
    saves: v('saved'),
    totalInteractions: v('total_interactions'),
    profileVisits: v('profile_visits'),
    follows: v('follows'),
    avgWatchTime: ms('ig_reels_avg_watch_time'),
    totalWatchTime: ms('ig_reels_video_view_total_time'),
    skipRate: v('reels_skip_rate'),
    storyReplies: v('replies'),
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as Metrics;
}

/* ---------------- Refresh ---------------- */

async function refresh(prev: Cache | undefined): Promise<Cache> {
  const { accessToken } = await currentToken();
  const me = await ig('/me', { fields: 'user_id,username,followers_count' }, accessToken);
  const accountId = String(me.user_id ?? me.id);
  const today = isoDay(Date.now());
  const followersNow = num(me.followers_count);

  // Posts: every post (few hundred at most), newest first.
  const items: any[] = [];
  let next: string | undefined = `${GRAPH}/${accountId}/media?fields=${MEDIA_FIELDS}&limit=50`;
  while (next && items.length < 500) {
    const page: any = await ig(next, {}, accessToken);
    items.push(...(page.data ?? []));
    next = page.paging?.next;
  }
  try {
    const stories = await ig(`/${accountId}/stories`, { fields: MEDIA_FIELDS }, accessToken);
    items.push(...(stories.data ?? []).map((m: any) => ({ ...m, media_product_type: 'STORY' })));
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 429)) throw err;
  }

  const prevPosts = new Map(prev?.posts.map((p) => [p.mediaId, p]));
  const insightsAt: Record<string, string> = {};
  const posts = items.map(toPost);
  const now = Date.now();
  const due = posts.filter((p) => {
    const last = prev?.insightsAt[p.mediaId];
    const hot = now - Date.parse(p.publishedAt) < HOT_POST_MS;
    return !last || now - Date.parse(last) > (hot ? REFRESH_AFTER_MS : DAY_MS);
  });
  const dueIds = new Set(due.map((p) => p.mediaId));
  const results = await pool(due, (p) => postInsights(p, accessToken).catch((err) => (err instanceof HttpError && err.status !== 502 ? Promise.reject(err) : null)));
  due.forEach((p, i) => {
    if (results[i]) {
      p.metrics = { ...p.metrics, ...results[i]! };
      insightsAt[p.mediaId] = new Date().toISOString();
    }
  });
  for (const p of posts) {
    if (dueIds.has(p.mediaId) && insightsAt[p.mediaId]) continue;
    // Not refreshed this time: keep the last insight numbers next to today's likes/comments.
    const old = prevPosts.get(p.mediaId);
    if (old) p.metrics = { ...old.metrics, ...p.metrics };
    if (prev?.insightsAt[p.mediaId]) insightsAt[p.mediaId] = prev.insightsAt[p.mediaId];
  }

  // Account days from the first post on: keep what we have, reread the last few
  // (Instagram revises them) and fill the gaps, newest first, a batch per refresh.
  const oldestPost = posts.reduce<string | undefined>((m, p) => (p.type !== 'Story' && (!m || p.publishedAt < m) ? p.publishedAt : m), undefined);
  const floor = isoDay(Date.now() - MAX_HISTORY_DAYS * DAY_MS);
  const historySince = oldestPost && oldestPost.slice(0, 10) > floor ? oldestPost.slice(0, 10) : floor;
  const days: Record<string, Day> = {};
  const missing: string[] = [];
  for (let t = Date.now(), i = 0; isoDay(t) >= historySince; t -= DAY_MS, i++) {
    const date = isoDay(t);
    if (i >= RECENT_DAYS && prev?.days[date]) days[date] = prev.days[date];
    else missing.push(date);
  }
  const want = missing.slice(0, RECENT_DAYS + BACKFILL_PER_REFRESH);
  const fresh = await pool(want, (date) => readDay(accountId, date, accessToken));
  for (const d of fresh) days[d.date] = d;

  return {
    scrapedAt: new Date().toISOString(),
    accountName: me.username ? `@${me.username}` : prev?.accountName,
    historySince,
    followersNow,
    followersByDay: { ...prev?.followersByDay, ...(followersNow !== undefined ? { [today]: followersNow } : {}) },
    days,
    posts,
    insightsAt,
  };
}

/* ---------------- Handler ---------------- */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function response(cache: Cache) {
  return {
    integration: {
      platform: 'Instagram',
      configured: true,
      connected: true,
      mode: 'instagram_login',
      accountName: cache.accountName,
      oauthAvailable: false,
      browserAvailable: false,
      snapshotAt: cache.scrapedAt,
      historySince: cache.historySince,
      ...(cache.error ? { error: cache.error } : {}),
    },
    scrape: {
      scrapedAt: cache.scrapedAt,
      followersNow: cache.followersNow,
      followersByDay: cache.followersByDay,
      days: cache.days,
      historySince: cache.historySince ?? Object.keys(cache.days).sort()[0],
      posts: cache.posts,
      warnings: [],
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const force = new URL(request.url).searchParams.has('force');
    const [raw] = await redis([['GET', KEY.data]]);
    const cache = parse<Cache>(raw);
    const last = cache ? Math.max(Date.parse(cache.scrapedAt), cache.failedAt ? Date.parse(cache.failedAt) : 0) : 0;
    const age = cache ? Date.now() - last : Infinity;
    if (cache && age < (force ? FORCE_MIN_GAP_MS : REFRESH_AFTER_MS)) return json(response(cache));

    // One refresh at a time; others get the cached numbers meanwhile.
    const [locked] = await redis([['SET', KEY.lock, '1', 'NX', 'EX', 90]]);
    if (locked !== 'OK') return cache ? json(response(cache)) : json({ error: { message: 'Instagram data is being loaded, try again in a minute.' } }, 503);
    try {
      const next = await refresh(cache);
      await redis([['SET', KEY.data, JSON.stringify(next)]]);
      return json(response(next));
    } catch (err) {
      if (!cache) throw err;
      // Keep showing the last numbers and say why they are old.
      const kept: Cache = { ...cache, error: err instanceof Error ? err.message : String(err), failedAt: new Date().toISOString() };
      await redis([['SET', KEY.data, JSON.stringify(kept)]]).catch(() => undefined);
      return json(response(kept));
    } finally {
      await redis([['DEL', KEY.lock]]).catch(() => undefined);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: { message: err.message } }, err.status);
    console.error('[instagram-data]', err);
    return json({ error: { message: 'Unexpected error while reading Instagram.' } }, 500);
  }
}
