import type { PostInput, PostMetrics } from '../../shared/insights.ts';
import { ApiError, RateLimitError, isFatal, readJson, safeFetch } from '../errors.ts';
import { addDaysUTC, todayUTC, unixToISO } from '../dates.ts';
import { schedule } from '../rateLimit.ts';
import { tokenStore, type StoredToken } from '../tokenStore.ts';
import { env, expiresIn, num, publicUrl, type ServerProvider } from './types.ts';

/**
 * TikTok Display API (Login Kit) — fallback when only basic access is
 * available. Lifetime counts only: no reach, watch time, traffic sources or
 * daily history. Each sync stores a follower snapshot for that day.
 * Docs: developers.tiktok.com/doc/tiktok-api-v2-get-user-info, …-video-list
 */

const LABEL = 'TikTok';
const BASE = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'];
const USER_FIELDS = 'open_id,display_name,username,follower_count,likes_count,video_count';
const VIDEO_FIELDS = 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count';
const FIVE_MIN = 5 * 60_000;

function toApiError(httpStatus: number, code: unknown, message: unknown): ApiError {
  const c = String(code ?? httpStatus);
  const msg = `TikTok: ${String(message || c)} (${c})`;
  if (httpStatus === 429 || c === 'rate_limit_exceeded') return new RateLimitError(`${msg}. Try again in a minute.`, 60, c);
  if (c === 'access_token_invalid' || httpStatus === 401) return new ApiError('token_expired', `${msg}. Reconnect TikTok in Settings → Integrations.`, { platformCode: c });
  if (c === 'scope_not_authorized' || c === 'scope_permission_missed' || httpStatus === 403) return new ApiError('permission', msg, { platformCode: c });
  return new ApiError('platform_error', msg, { platformCode: c });
}

async function call(method: 'GET' | 'POST', path: string, token: string, body?: unknown): Promise<any> {
  return schedule('tiktok_display', async () => {
    const res = await safeFetch(LABEL, `${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await readJson(res);
    const err = json.error;
    if (!res.ok || (err && err.code && err.code !== 'ok')) throw toApiError(res.status, err?.code, err?.message ?? json._raw);
    return json.data ?? {};
  });
}

async function oauthToken(form: Record<string, string>): Promise<any> {
  return schedule('tiktok_display', async () => {
    const res = await safeFetch(LABEL, `${BASE}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });
    const json = await readJson(res);
    if (!res.ok || json.error || !json.access_token) throw toApiError(res.status, json.error, json.error_description ?? json.message);
    return json;
  });
}

function fromTokenResponse(json: any, prev?: Partial<StoredToken>): Omit<StoredToken, 'accountName' | 'connectedAt'> {
  return {
    platform: 'TikTok',
    mode: 'tiktok_display',
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? prev?.refreshToken,
    expiresAt: expiresIn(json.expires_in) ?? prev?.expiresAt,
    refreshExpiresAt: expiresIn(json.refresh_expires_in) ?? prev?.refreshExpiresAt,
    issuedAt: new Date().toISOString(),
    accountId: String(json.open_id ?? prev?.accountId ?? ''),
  };
}

async function userInfo(accessToken: string) {
  const data = await call('GET', `/user/info/?fields=${USER_FIELDS}`, accessToken);
  return data.user ?? {};
}

const hasSecrets = () => !!(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET'));

export const tiktokDisplayProvider: ServerProvider = {
  mode: 'tiktok_display',
  label: LABEL,

  configured: hasSecrets,
  oauthReady: () => !!publicUrl(),
  redirectUri: () => (publicUrl() ? `${publicUrl()}/api/auth/tiktok/callback` : null),

  authorizeUrl(state) {
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.searchParams.set('client_key', env('TIKTOK_CLIENT_KEY') ?? '');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('redirect_uri', this.redirectUri() ?? '');
    u.searchParams.set('state', state);
    return u.toString();
  },

  async exchangeCode(params) {
    const code = params.get('code');
    if (!code) throw new ApiError('bad_request', 'TikTok did not return an authorization code.');
    const json = await oauthToken({
      client_key: env('TIKTOK_CLIENT_KEY') ?? '',
      client_secret: env('TIKTOK_CLIENT_SECRET') ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri() ?? '',
    });
    const base = fromTokenResponse(json);
    const user = await userInfo(base.accessToken);
    return { ...base, accountId: String(user.open_id ?? base.accountId), accountName: accountName(user), connectedAt: new Date().toISOString() };
  },

  async fromPastedToken(accessToken, refreshToken) {
    const user = await userInfo(accessToken);
    return {
      platform: 'TikTok',
      mode: 'tiktok_display',
      accessToken,
      refreshToken,
      // Display tokens last 24h; we don't know when this one was issued.
      issuedAt: new Date().toISOString(),
      accountId: String(user.open_id ?? ''),
      accountName: accountName(user),
      connectedAt: new Date().toISOString(),
    };
  },

  async ensureFresh(token) {
    const exp = token.expiresAt ? Date.parse(token.expiresAt) : undefined;
    if (exp === undefined || exp - Date.now() > FIVE_MIN) return token;
    if (!token.refreshToken || !hasSecrets()) {
      if (exp > Date.now()) return token;
      throw new ApiError('token_expired', 'The TikTok access token expired (24 hours) and cannot be refreshed without TIKTOK_CLIENT_KEY/SECRET and a refresh token. Reconnect TikTok.');
    }
    try {
      const json = await oauthToken({
        client_key: env('TIKTOK_CLIENT_KEY') ?? '',
        client_secret: env('TIKTOK_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      });
      const next: StoredToken = { ...token, ...fromTokenResponse(json, token), error: undefined };
      tokenStore.set(next);
      return next;
    } catch (err) {
      throw new ApiError('token_expired', `Could not refresh the TikTok token: ${(err as Error).message}. Reconnect TikTok.`);
    }
  },

  async revoke(token) {
    if (!hasSecrets()) return;
    await safeFetch(LABEL, `${BASE}/oauth/revoke/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: env('TIKTOK_CLIENT_KEY') ?? '', client_secret: env('TIKTOK_CLIENT_SECRET') ?? '', token: token.accessToken }),
    });
  },

  async account(token, range) {
    const user = await userInfo(token.accessToken);
    const today = todayUTC();
    const warnings = [
      'TikTok Display API only gives lifetime totals: no reach, views or daily history. Follower history builds up from each sync. Use the TikTok API for Business for full account insights.',
    ];
    const inRange = today >= range.since && today <= range.until;
    return {
      followersNow: num(user.follower_count),
      days: inRange ? [{ platform: 'TikTok', date: today, followers: num(user.follower_count) }] : [],
      warnings,
    };
  },

  async media(token, range) {
    const sinceSec = Date.parse(`${range.since}T00:00:00Z`) / 1000;
    const untilSec = Date.parse(`${addDaysUTC(range.until, 1)}T00:00:00Z`) / 1000;
    const posts: PostInput[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < 50; page++) {
      const data = await call('POST', `/video/list/?fields=${VIDEO_FIELDS}`, token.accessToken, { max_count: 20, ...(cursor !== undefined ? { cursor } : {}) });
      const videos: any[] = data.videos ?? [];
      for (const v of videos) {
        const t = Number(v.create_time);
        if (t >= sinceSec && t < untilSec) posts.push(toPost(v));
      }
      const oldest = videos.length ? Math.min(...videos.map((v) => Number(v.create_time))) : 0;
      if (!data.has_more || !videos.length || oldest < sinceSec) break;
      cursor = data.cursor;
    }
    return {
      posts,
      warnings: ['TikTok Display API has no reach, watch time, completion rate or traffic sources — those show as “—”.'],
    };
  },

  async mediaInsights(token, refs) {
    const metrics: Record<string, PostMetrics> = {};
    const warnings: string[] = [];
    const ids = refs.map((r) => r.mediaId);
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      try {
        const data = await call('POST', `/video/query/?fields=${VIDEO_FIELDS}`, token.accessToken, { filters: { video_ids: chunk } });
        for (const v of data.videos ?? []) metrics[String(v.id)] = toPost(v).metrics;
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

function accountName(user: any): string {
  return user.username ? `@${user.username}` : (user.display_name ?? 'TikTok account');
}

function toPost(v: any): PostInput {
  const metrics: PostMetrics = {
    views: num(v.view_count),
    likes: num(v.like_count),
    comments: num(v.comment_count),
    shares: num(v.share_count),
  };
  return {
    platform: 'TikTok',
    mediaId: String(v.id),
    permalink: v.share_url ?? '',
    type: 'Video',
    publishedAt: unixToISO(Number(v.create_time)),
    caption: v.video_description || v.title || '',
    thumbnail: v.cover_image_url ?? '',
    metrics: Object.fromEntries(Object.entries(metrics).filter(([, x]) => x !== undefined)) as PostMetrics,
  };
}
