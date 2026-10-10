import type { AccountDayInput, PostInput, PostMetrics, PostType } from '../../shared/insights.ts';
import { ApiError, RateLimitError, isFatal, readJson, safeFetch } from '../errors.ts';
import { addDaysUTC, maxDate, todayUTC, unixToISO } from '../dates.ts';
import { schedule } from '../rateLimit.ts';
import { tokenStore, type StoredToken } from '../tokenStore.ts';
import { env, expiresIn, num, publicUrl, type ServerProvider } from './types.ts';

/**
 * TikTok API for Business v1.3 — "TikTok Accounts" endpoints.
 * Needs the Accounts API access form (since 20 Mar 2026) and scopes
 * user.info.basic, user.info.username, user.info.stats, user.insights,
 * video.list, video.insights. Reach / daily follower metrics additionally need
 * Advanced Access or a Verified Business account.
 * Docs: business-api.tiktok.com/portal/docs (Accounts API).
 */

const LABEL = 'TikTok';
const BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const FIVE_MIN = 5 * 60_000;

const BASIC_DAILY = ['video_views', 'profile_views', 'likes', 'comments', 'shares', 'followers_count'];
const ADVANCED_DAILY = ['unique_video_views', 'daily_new_followers', 'daily_lost_followers', 'bio_link_clicks', 'engaged_audience'];
const PROFILE_FIELDS = ['display_name', 'username', 'followers_count'];

const VIDEO_BASIC = ['item_id', 'media_type', 'thumbnail_url', 'share_url', 'caption', 'create_time', 'likes', 'comments', 'shares', 'favorites', 'reach', 'video_views'];
const VIDEO_INSIGHTS = ['total_time_watched', 'average_time_watched', 'full_video_watched_rate', 'new_followers', 'profile_views', 'impression_sources'];

/* ---------------- HTTP ---------------- */

function toApiError(httpStatus: number, code: unknown, message: unknown): ApiError {
  const text = String(message ?? `HTTP ${httpStatus}`);
  const msg = `TikTok: ${text} (code ${String(code ?? httpStatus)})`;
  const lower = text.toLowerCase();
  if (httpStatus === 429 || /rate limit|too many|frequency|qps|qpm/.test(lower)) return new RateLimitError(`${msg}. TikTok is rate-limiting this account; try again in a minute.`, 60, code as string);
  if (/access[_ ]?token/.test(lower) && /(expire|invalid|revoked)/.test(lower)) {
    return new ApiError('token_expired', `${msg}. Reconnect TikTok in Settings → Integrations.`, { platformCode: code as string });
  }
  if (/permission|scope|not authori|unauthori|access denied|no access/.test(lower)) return new ApiError('permission', msg, { platformCode: code as string });
  return new ApiError('platform_error', msg, { platformCode: code as string });
}

async function call(method: 'GET' | 'POST', path: string, opts: { token?: string; query?: Record<string, unknown>; body?: unknown } = {}): Promise<any> {
  return schedule('tiktok_business', async () => {
    const u = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined) continue;
      u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.token) headers['Access-Token'] = opts.token;
    const res = await safeFetch(LABEL, u.toString(), { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const json = await readJson(res);
    if (!res.ok || (json.code !== undefined && json.code !== 0)) throw toApiError(res.status, json.code, json.message ?? json._raw);
    return json.data ?? {};
  });
}

/* ---------------- Token lifecycle ---------------- */

function tokenFromResponse(data: any, prev?: Partial<StoredToken>): Omit<StoredToken, 'accountName' | 'connectedAt'> {
  return {
    platform: 'TikTok',
    mode: 'tiktok_business',
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? prev?.refreshToken,
    expiresAt: expiresIn(data.expires_in) ?? prev?.expiresAt,
    refreshExpiresAt: expiresIn(data.refresh_token_expires_in ?? data.refresh_expires_in) ?? prev?.refreshExpiresAt,
    issuedAt: new Date().toISOString(),
    accountId: String(data.open_id ?? prev?.accountId ?? ''),
  };
}

async function profileName(accessToken: string, openId: string): Promise<string> {
  const data = await call('GET', '/business/get/', { token: accessToken, query: { business_id: openId, fields: PROFILE_FIELDS } });
  return data.username ? `@${data.username}` : (data.display_name ?? 'TikTok account');
}

const hasSecrets = () => !!(env('TIKTOK_BUSINESS_APP_ID') && env('TIKTOK_BUSINESS_SECRET'));

async function refreshWith(refreshToken: string) {
  return call('POST', '/tt_user/oauth2/refresh_token/', {
    body: { client_id: env('TIKTOK_BUSINESS_APP_ID'), client_secret: env('TIKTOK_BUSINESS_SECRET'), grant_type: 'refresh_token', refresh_token: refreshToken },
  });
}

export const tiktokBusinessProvider: ServerProvider = {
  mode: 'tiktok_business',
  label: LABEL,

  configured: hasSecrets,
  oauthReady: () => !!(publicUrl() && env('TIKTOK_BUSINESS_AUTH_URL')),
  // TikTok Business requires the redirect URI to end with "/" and carry no query string.
  redirectUri: () => (publicUrl() ? `${publicUrl()}/api/auth/tiktok/callback/` : null),

  authorizeUrl(state) {
    const u = new URL(env('TIKTOK_BUSINESS_AUTH_URL') ?? '');
    u.searchParams.set('state', state);
    if (!u.searchParams.get('redirect_uri') && this.redirectUri()) u.searchParams.set('redirect_uri', this.redirectUri()!);
    return u.toString();
  },

  async exchangeCode(params) {
    const authCode = params.get('auth_code') ?? params.get('code');
    if (!authCode) throw new ApiError('bad_request', 'TikTok did not return an authorization code.');
    const data = await call('POST', '/tt_user/oauth2/token/', {
      body: {
        client_id: env('TIKTOK_BUSINESS_APP_ID'),
        client_secret: env('TIKTOK_BUSINESS_SECRET'),
        grant_type: 'authorization_code',
        auth_code: authCode,
        redirect_uri: this.redirectUri(),
      },
    });
    const base = tokenFromResponse(data);
    if (!base.accountId) throw new ApiError('platform_error', 'TikTok did not return the account open_id.');
    return { ...base, accountName: await profileName(base.accessToken, base.accountId), connectedAt: new Date().toISOString() };
  },

  async fromPastedToken(accessToken, refreshToken, openId) {
    let base: Omit<StoredToken, 'accountName' | 'connectedAt'> = {
      platform: 'TikTok',
      mode: 'tiktok_business',
      accessToken,
      refreshToken,
      issuedAt: new Date().toISOString(),
      accountId: openId ?? '',
    };
    // A refresh both validates the pair and tells us the open_id + expiry.
    if (refreshToken && hasSecrets()) {
      try {
        base = tokenFromResponse(await refreshWith(refreshToken), base);
      } catch (err) {
        if (!openId) throw err;
      }
    }
    if (!base.accountId) {
      throw new ApiError('bad_request', 'Paste the refresh token too (with TIKTOK_BUSINESS_APP_ID/SECRET in .env) or include the account open_id, so the TikTok account can be identified.');
    }
    return { ...base, accountName: await profileName(base.accessToken, base.accountId), connectedAt: new Date().toISOString() };
  },

  async ensureFresh(token) {
    const exp = token.expiresAt ? Date.parse(token.expiresAt) : undefined;
    if (exp === undefined || exp - Date.now() > FIVE_MIN) return token;
    if (!token.refreshToken || !hasSecrets()) {
      if (exp > Date.now()) return token;
      throw new ApiError('token_expired', 'The TikTok access token expired (they last 24 hours) and cannot be refreshed without TIKTOK_BUSINESS_APP_ID/SECRET and a refresh token. Reconnect TikTok.');
    }
    try {
      const next: StoredToken = { ...token, ...tokenFromResponse(await refreshWith(token.refreshToken), token), error: undefined };
      tokenStore.set(next);
      return next;
    } catch (err) {
      throw new ApiError('token_expired', `Could not refresh the TikTok token: ${(err as Error).message}. Reconnect TikTok.`);
    }
  },

  async revoke(token) {
    await call('POST', '/tt_user/oauth2/revoke/', {
      body: { client_id: env('TIKTOK_BUSINESS_APP_ID'), client_secret: env('TIKTOK_BUSINESS_SECRET'), access_token: token.accessToken },
    });
  },

  /* ---------------- Account ---------------- */

  async account(token, range) {
    const warnings: string[] = [];
    const earliest = addDaysUTC(todayUTC(), -59);
    const since = maxDate(range.since, earliest);
    if (since !== range.since) warnings.push(`TikTok only returns the last 60 days of account data; days before ${earliest} come from earlier syncs.`);

    const fetchDaily = (metrics: string[]) =>
      call('GET', '/business/get/', {
        token: token.accessToken,
        query: { business_id: token.accountId, start_date: since, end_date: range.until, fields: [...PROFILE_FIELDS, ...metrics] },
      });

    let data: any;
    try {
      data = await fetchDaily([...BASIC_DAILY, ...ADVANCED_DAILY]);
    } catch (err) {
      if (isFatal(err)) throw err;
      data = await fetchDaily(BASIC_DAILY);
      warnings.push(`TikTok did not allow ${ADVANCED_DAILY.join(', ')} (needs Advanced Access or a Verified Business account), so account reach and daily follower changes show as “—”.`);
    }

    const rows: any[] = Array.isArray(data.metrics) ? data.metrics : [];
    if (!rows.length) warnings.push('TikTok returned no daily metrics. Make sure Analytics is turned on in the TikTok app (it can take 24–48 hours).');
    const days: AccountDayInput[] = rows.map((r) => {
      const likes = num(r.likes);
      const comments = num(r.comments);
      const shares = num(r.shares);
      const gained = num(r.daily_new_followers);
      const lost = num(r.daily_lost_followers);
      return {
        platform: 'TikTok',
        date: String(r.date).slice(0, 10),
        followers: num(r.followers_count ?? r.daily_total_followers),
        netFollowers: gained !== undefined && lost !== undefined ? gained - lost : undefined,
        reach: num(r.unique_video_views),
        views: num(r.video_views),
        profileVisits: num(r.profile_views),
        accountsEngaged: num(r.engaged_audience),
        likes,
        comments,
        shares,
        interactions: likes !== undefined && comments !== undefined && shares !== undefined ? likes + comments + shares : undefined,
        linkClicks: num(r.bio_link_clicks),
      };
    });
    return { followersNow: num(data.followers_count), days, warnings };
  },

  /* ---------------- Media ---------------- */

  async media(token, range) {
    const warnings: string[] = [];
    const sinceSec = Date.parse(`${range.since}T00:00:00Z`) / 1000;
    const untilSec = Date.parse(`${addDaysUTC(range.until, 1)}T00:00:00Z`) / 1000;
    let fields = [...VIDEO_BASIC, ...VIDEO_INSIGHTS];
    const posts: PostInput[] = [];
    let cursor: number | undefined;

    for (let page = 0; page < 50; page++) {
      let data: any;
      try {
        data = await listVideos(token, fields, { cursor });
      } catch (err) {
        if (isFatal(err) || fields.length === VIDEO_BASIC.length) throw err;
        fields = VIDEO_BASIC;
        warnings.push('TikTok rejected the video.insights fields (watch time, completion, traffic sources) — check the video.insights scope.');
        data = await listVideos(token, fields, { cursor });
      }
      const videos: any[] = data.videos ?? [];
      for (const v of videos) {
        const t = Number(v.create_time);
        if (t >= sinceSec && t < untilSec) posts.push(toPost(v));
      }
      const oldest = videos.length ? Math.min(...videos.map((v) => Number(v.create_time))) : 0;
      if (!data.has_more || !videos.length || oldest < sinceSec) break;
      cursor = data.cursor;
    }
    return { posts, warnings };
  },

  async mediaInsights(token, refs) {
    const metrics: Record<string, PostMetrics> = {};
    const warnings: string[] = [];
    const ids = refs.map((r) => r.mediaId);
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      try {
        let data: any;
        try {
          data = await listVideos(token, [...VIDEO_BASIC, ...VIDEO_INSIGHTS], { videoIds: chunk });
        } catch (err) {
          if (isFatal(err)) throw err;
          data = await listVideos(token, VIDEO_BASIC, { videoIds: chunk });
          warnings.push('TikTok rejected the video.insights fields; only basic counts were updated.');
        }
        for (const v of data.videos ?? []) metrics[String(v.item_id)] = toPost(v).metrics;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'rate_limited') {
          warnings.push(`Stopped early: ${err.message}`);
          break;
        }
        if (isFatal(err)) throw err;
        warnings.push(`Videos ${chunk.join(', ')}: ${(err as Error).message}`);
      }
    }
    return { metrics, warnings };
  },
};

/* ---------------- Helpers ---------------- */

function listVideos(token: StoredToken, fields: string[], opts: { cursor?: number; videoIds?: string[] }) {
  return call('GET', '/business/video/list/', {
    token: token.accessToken,
    query: {
      business_id: token.accountId,
      fields,
      max_count: '20',
      cursor: opts.cursor !== undefined ? String(opts.cursor) : undefined,
      filters: opts.videoIds ? { video_ids: opts.videoIds } : undefined,
    },
  });
}

function trafficSources(raw: unknown): Record<string, number> | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const entries = raw
    .map((s: any) => [String(s.impression_source ?? s.source ?? 'Other'), num(s.percentage ?? s.value)] as const)
    .filter((e): e is readonly [string, number] => e[1] !== undefined);
  if (!entries.length) return undefined;
  const asFraction = entries.every(([, v]) => v <= 1);
  return Object.fromEntries(entries.map(([k, v]) => [k, asFraction ? v * 100 : v]));
}

function toPost(v: any): PostInput {
  const rate = num(v.full_video_watched_rate);
  const media = String(v.media_type ?? '').toUpperCase();
  const type: PostType = /PHOTO|IMAGE|CAROUSEL/.test(media) ? 'Carousel' : 'Video';
  const metrics: PostMetrics = {
    views: num(v.video_views),
    reach: num(v.reach),
    likes: num(v.likes),
    comments: num(v.comments),
    shares: num(v.shares),
    saves: num(v.favorites),
    profileVisits: num(v.profile_views),
    follows: num(v.new_followers),
    avgWatchTime: num(v.average_time_watched),
    totalWatchTime: num(v.total_time_watched),
    completionRate: rate === undefined ? undefined : rate <= 1 ? rate * 100 : rate,
    trafficSources: trafficSources(v.impression_sources),
  };
  return {
    platform: 'TikTok',
    mediaId: String(v.item_id),
    permalink: v.share_url ?? '',
    type,
    publishedAt: unixToISO(Number(v.create_time)),
    caption: v.caption ?? '',
    thumbnail: v.thumbnail_url ?? '',
    metrics: Object.fromEntries(Object.entries(metrics).filter(([, x]) => x !== undefined)) as PostMetrics,
  };
}
