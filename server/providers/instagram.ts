import type { AccountDayInput, PostInput, PostMetrics, PostType } from '../../shared/insights.ts';
import { ApiError, RateLimitError, isFatal, readJson, safeFetch } from '../errors.ts';
import { addDaysUTC, eachDay, maxDate, todayUTC, unixDayStart } from '../dates.ts';
import { META_RATE_LIMIT_CODES, noteMetaUsage, schedule } from '../rateLimit.ts';
import { tokenStore, type StoredToken } from '../tokenStore.ts';
import { env, expiresIn, num, publicUrl, type MediaRef, type ServerProvider } from './types.ts';

/**
 * Instagram API with Instagram Login (graph.instagram.com) — no Facebook Page
 * needed. Scopes: instagram_business_basic, instagram_business_manage_insights.
 * Docs: developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

const LABEL = 'Instagram';
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];
const graph = () => `https://graph.instagram.com/${env('IG_GRAPH_VERSION') ?? 'v26.0'}`;
const DAY_MS = 86_400_000;

const ACCOUNT_METRICS = ['views', 'reach', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_links_taps', 'profile_views'];
const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count';
const BASE_MEDIA_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];
const METRICS_BY_TYPE: Record<'reels' | 'feed' | 'story', string[]> = {
  reels: [...BASE_MEDIA_METRICS, 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate'],
  feed: [...BASE_MEDIA_METRICS, 'profile_visits', 'follows'],
  story: ['views', 'reach', 'shares', 'total_interactions', 'profile_visits', 'follows', 'replies'],
};

/* ---------------- HTTP ---------------- */

function toApiError(status: number, error: any): ApiError {
  const code = Number(error?.code);
  const sub = error?.error_subcode ? `/${error.error_subcode}` : '';
  const msg = `Instagram: ${error?.error_user_msg || error?.message || `HTTP ${status}`} (code ${Number.isFinite(code) ? code : status}${sub})`;
  if (status === 429 || META_RATE_LIMIT_CODES.has(code)) return new RateLimitError(`${msg}. Instagram is rate-limiting this app; try again later.`, 600, code);
  if (code === 190 || status === 401) return new ApiError('token_expired', `${msg}. The access token is invalid or expired — reconnect Instagram.`, { platformCode: code });
  if (code === 10 || (code >= 200 && code < 300)) return new ApiError('permission', `${msg}. Check that the app has instagram_business_manage_insights.`, { platformCode: code });
  return new ApiError('platform_error', msg, { platformCode: code });
}

async function igGet(url: string): Promise<any> {
  return schedule('instagram', async () => {
    const res = await safeFetch(LABEL, url);
    noteMetaUsage(res.headers);
    const body = await readJson(res);
    if (!res.ok || body?.error) throw toApiError(res.status, body?.error);
    return body;
  });
}

function withToken(path: string, params: Record<string, string | number>, token: string): string {
  const u = new URL(path.startsWith('http') ? path : `${graph()}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set('access_token', token);
  return u.toString();
}

/* ---------------- Token lifecycle ---------------- */

async function fetchProfile(accessToken: string) {
  const me = await igGet(withToken('/me', { fields: 'user_id,username,name,followers_count,media_count' }, accessToken));
  return {
    accountId: String(me.user_id ?? me.id),
    accountName: me.username ? `@${me.username}` : (me.name ?? 'Instagram account'),
    followers: num(me.followers_count),
  };
}

async function refresh(accessToken: string): Promise<{ accessToken: string; expiresAt?: string }> {
  const body = await igGet(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`);
  return { accessToken: body.access_token ?? accessToken, expiresAt: expiresIn(body.expires_in) };
}

export const instagramProvider: ServerProvider = {
  mode: 'instagram_login',
  label: LABEL,

  configured: () => !!(env('IG_APP_ID') && env('IG_APP_SECRET')),
  oauthReady: () => !!publicUrl(),
  redirectUri: () => (publicUrl() ? `${publicUrl()}/api/auth/instagram/callback` : null),

  authorizeUrl(state) {
    const u = new URL('https://www.instagram.com/oauth/authorize');
    u.searchParams.set('client_id', env('IG_APP_ID') ?? '');
    u.searchParams.set('redirect_uri', this.redirectUri() ?? '');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('state', state);
    return u.toString();
  },

  async exchangeCode(params) {
    const code = (params.get('code') ?? '').replace(/#_$/, '');
    if (!code) throw new ApiError('bad_request', 'Instagram did not return an authorization code.');
    const form = new URLSearchParams({
      client_id: env('IG_APP_ID') ?? '',
      client_secret: env('IG_APP_SECRET') ?? '',
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri() ?? '',
      code,
    });
    const shortRes = await safeFetch(LABEL, 'https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
    const shortBody = await readJson(shortRes);
    const short = Array.isArray(shortBody?.data) ? shortBody.data[0] : shortBody;
    if (!shortRes.ok || !short?.access_token) {
      throw toApiError(shortRes.status, shortBody?.error ?? { message: shortBody?.error_message ?? 'Could not exchange the authorization code.' });
    }
    // Short-lived → long-lived (60 days).
    const long = await igGet(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(env('IG_APP_SECRET') ?? '')}&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const profile = await fetchProfile(long.access_token);
    const now = new Date().toISOString();
    return {
      platform: 'Instagram',
      mode: 'instagram_login',
      accessToken: long.access_token,
      expiresAt: expiresIn(long.expires_in),
      issuedAt: now,
      accountId: profile.accountId,
      accountName: profile.accountName,
      connectedAt: now,
    };
  },

  async fromPastedToken(accessToken) {
    const profile = await fetchProfile(accessToken);
    const now = new Date().toISOString();
    let token = accessToken;
    let expiresAt: string | undefined;
    // A refresh tells us the expiry (works when the token is ≥24h old).
    try {
      const r = await refresh(accessToken);
      token = r.accessToken;
      expiresAt = r.expiresAt;
    } catch {
      /* keep the pasted token; expiry unknown */
    }
    return {
      platform: 'Instagram',
      mode: 'instagram_login',
      accessToken: token,
      expiresAt,
      issuedAt: expiresAt ? now : new Date(Date.now() - DAY_MS).toISOString(),
      accountId: profile.accountId,
      accountName: profile.accountName,
      connectedAt: now,
    };
  },

  async ensureFresh(token) {
    const now = Date.now();
    const exp = token.expiresAt ? Date.parse(token.expiresAt) : undefined;
    if (exp !== undefined && exp <= now) {
      throw new ApiError('token_expired', 'The Instagram token has expired (tokens last 60 days). Reconnect Instagram in Settings → Integrations.');
    }
    const oldEnough = now - Date.parse(token.issuedAt) > DAY_MS;
    const expiringSoon = exp === undefined || exp - now < 7 * DAY_MS;
    if (!oldEnough || !expiringSoon) return token;
    try {
      const r = await refresh(token.accessToken);
      const next: StoredToken = { ...token, accessToken: r.accessToken, expiresAt: r.expiresAt ?? token.expiresAt, issuedAt: new Date().toISOString(), error: undefined };
      tokenStore.set(next);
      return next;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'token_expired') throw err;
      return token; // refresh is best effort; the current token may still work
    }
  },

  /* ---------------- Account insights ---------------- */

  async account(token, range) {
    const warnings = new Set<string>();
    const since = maxDate(range.since, addDaysUTC(todayUTC(), -729));
    if (since !== range.since) warnings.add('Instagram keeps account history for 2 years; older days were skipped.');
    const profile = await fetchProfile(token.accessToken);
    const days: AccountDayInput[] = [];

    for (const date of eachDay(since, range.until)) {
      const window = { since: unixDayStart(date), until: unixDayStart(addDaysUTC(date, 1)) };
      const row: AccountDayInput = { platform: 'Instagram', date };
      try {
        const body = await igGet(
          withToken(`/${token.accountId}/insights`, { metric: ACCOUNT_METRICS.join(','), period: 'day', metric_type: 'total_value', ...window }, token.accessToken),
        );
        const val = (name: string) => {
          const m = (body.data as any[] | undefined)?.find((d) => d.name === name);
          return num(m?.total_value?.value ?? m?.values?.[0]?.value);
        };
        row.views = val('views');
        row.reach = val('reach');
        row.accountsEngaged = val('accounts_engaged');
        row.interactions = val('total_interactions');
        row.likes = val('likes');
        row.comments = val('comments');
        row.shares = val('shares');
        row.saves = val('saves');
        row.linkClicks = val('profile_links_taps');
        row.profileVisits = val('profile_views');
      } catch (err) {
        if (isFatal(err)) throw err;
        warnings.add(`Instagram daily insights failed for some days: ${(err as Error).message}`);
      }
      try {
        const body = await igGet(
          withToken(`/${token.accountId}/insights`, { metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', ...window }, token.accessToken),
        );
        row.netFollowers = parseFollows(body);
      } catch (err) {
        if (isFatal(err)) throw err;
        warnings.add('Instagram did not return follows/unfollows for some days (it needs 100+ followers).');
      }
      days.push(row);
    }
    // Today's real follower count; the client rebuilds history from netFollowers.
    const today = days.find((d) => d.date === todayUTC());
    if (today && profile.followers !== undefined) today.followers = profile.followers;
    return { followersNow: profile.followers, days, warnings: [...warnings] };
  },

  /* ---------------- Media ---------------- */

  async media(token, range) {
    const warnings: string[] = [];
    const sinceMs = Date.parse(`${range.since}T00:00:00Z`);
    const untilMs = Date.parse(`${addDaysUTC(range.until, 1)}T00:00:00Z`);
    const posts: PostInput[] = [];

    let url: string | undefined = withToken(`/${token.accountId}/media`, { fields: MEDIA_FIELDS, limit: 50 }, token.accessToken);
    while (url) {
      const page: any = await igGet(url);
      const items: any[] = page.data ?? [];
      for (const m of items) {
        const t = Date.parse(m.timestamp);
        if (t >= sinceMs && t < untilMs) posts.push(toPost(m));
      }
      const oldest = items.length ? Date.parse(items[items.length - 1].timestamp) : 0;
      url = items.length && oldest >= sinceMs ? page.paging?.next : undefined;
    }

    try {
      const stories = await igGet(withToken(`/${token.accountId}/stories`, { fields: MEDIA_FIELDS }, token.accessToken));
      for (const m of stories.data ?? []) posts.push(toPost({ ...m, media_product_type: 'STORY' }));
    } catch (err) {
      if (isFatal(err)) throw err;
      warnings.push(`Instagram stories could not be listed: ${(err as Error).message}`);
    }
    return { posts, warnings };
  },

  async mediaInsights(token, refs) {
    const metrics: Record<string, PostMetrics> = {};
    const warnings: string[] = [];
    for (const ref of refs) {
      try {
        metrics[ref.mediaId] = await mediaInsightsFor(token.accessToken, ref);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'rate_limited') {
          warnings.push(`Stopped early: ${err.message} ${refs.length - Object.keys(metrics).length} post(s) were not updated.`);
          break;
        }
        if (isFatal(err)) throw err;
        warnings.push(`Post ${ref.mediaId}: ${(err as Error).message}`);
      }
    }
    return { metrics, warnings };
  },
};

/* ---------------- Helpers ---------------- */

function parseFollows(body: any): number | undefined {
  const m = (body.data as any[] | undefined)?.find((d) => d.name === 'follows_and_unfollows');
  if (!m) return undefined;
  const results: any[] = m.total_value?.breakdowns?.[0]?.results ?? [];
  if (!results.length) return num(m.total_value?.value);
  let net = 0;
  for (const r of results) {
    const dim = String((r.dimension_values ?? []).join(' ')).toUpperCase();
    const v = num(r.value) ?? 0;
    net += dim.includes('UNFOLLOW') || dim.includes('NON_FOLLOWER') ? -v : v;
  }
  return net;
}

function postType(m: any): PostType {
  const product = String(m.media_product_type ?? '').toUpperCase();
  if (product === 'STORY') return 'Story';
  if (product === 'REELS' || String(m.permalink ?? '').includes('/reel/')) return 'Reels';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'Carousel';
  if (m.media_type === 'IMAGE') return 'Static';
  return 'Video';
}

function toPost(m: any): PostInput {
  return {
    platform: 'Instagram',
    mediaId: String(m.id),
    permalink: m.permalink ?? '',
    type: postType(m),
    publishedAt: m.timestamp,
    caption: m.caption ?? '',
    thumbnail: m.thumbnail_url || m.media_url || '',
    metrics: { likes: num(m.like_count), comments: num(m.comments_count) },
  };
}

function metricValue(body: any, name: string): number | undefined {
  const m = (body.data as any[] | undefined)?.find((d) => d.name === name);
  return num(m?.values?.[0]?.value ?? m?.total_value?.value);
}

async function mediaInsightsFor(accessToken: string, ref: MediaRef): Promise<PostMetrics> {
  const kind = ref.type === 'Reels' ? 'reels' : ref.type === 'Story' ? 'story' : 'feed';
  let body: any;
  try {
    body = await igGet(withToken(`/${ref.mediaId}/insights`, { metric: METRICS_BY_TYPE[kind].join(',') }, accessToken));
  } catch (err) {
    // An unsupported metric for this media (code 100) → retry with the safe set.
    if (!(err instanceof ApiError && Number(err.platformCode) === 100)) throw err;
    body = await igGet(withToken(`/${ref.mediaId}/insights`, { metric: (kind === 'story' ? METRICS_BY_TYPE.story : BASE_MEDIA_METRICS).join(',') }, accessToken));
  }
  const v = (n: string) => metricValue(body, n);
  const ms = (n: string) => {
    const x = v(n);
    return x === undefined ? undefined : x / 1000;
  };
  const out: PostMetrics = {
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

  if (kind === 'story') {
    try {
      const nav = await igGet(withToken(`/${ref.mediaId}/insights`, { metric: 'navigation', breakdown: 'story_navigation_action_type' }, accessToken));
      const m = (nav.data as any[] | undefined)?.find((d) => d.name === 'navigation');
      const results: any[] = m?.total_value?.breakdowns?.[0]?.results ?? [];
      if (results.length) {
        out.storyNavigation = Object.fromEntries(results.map((r) => [String(r.dimension_values?.[0] ?? 'other').toLowerCase(), num(r.value) ?? 0]));
      }
    } catch (err) {
      if (isFatal(err)) throw err;
    }
  }
  // Drop undefined keys so "not provided" stays absent.
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as PostMetrics;
}
