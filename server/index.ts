/**
 * KARDEUCE insights API. Holds platform tokens and app secrets so they never
 * reach the browser bundle. The Vite dev server proxies /api/* here.
 *
 *   npm run dev       → web (5173) + api (8787)
 *   npm run dev:api   → api only
 */
import { randomBytes } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { SOCIAL_PLATFORMS, type DateRange, type IntegrationStatus, type IntegrationsResponse, type PostType, type SocialPlatform } from '../shared/insights.ts';
import { ApiError } from './errors.ts';
import { addDaysUTC, isISODate } from './dates.ts';
import { tokenStore, type StoredToken } from './tokenStore.ts';
import { env, type MediaRef, type ServerProvider } from './providers/types.ts';
import { instagramProvider } from './providers/instagram.ts';
import { tiktokBusinessProvider } from './providers/tiktokBusiness.ts';
import { tiktokDisplayProvider } from './providers/tiktokDisplay.ts';
import { tiktokStudioProvider } from './providers/tiktokStudio.ts';
import { metaBusinessSuiteProvider } from './providers/metaBusinessSuite.ts';
import type { BrowserProvider } from './providers/browserProvider.ts';
import { browserAvailable } from './browser/chrome.ts';
import { readScrape } from './browser/cache.ts';

try {
  process.loadEnvFile();
} catch {
  /* no .env → mock mode in the app */
}

const PORT = Number(env('PORT') ?? 8787);
const appUrl = () => (env('APP_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');

/* ---------------- Provider selection ---------------- */

function parsePlatform(raw: string): SocialPlatform {
  const p = raw.toLowerCase();
  if (p === 'instagram') return 'Instagram';
  if (p === 'tiktok') return 'TikTok';
  throw new ApiError('bad_request', `Unknown platform "${raw}". Use instagram or tiktok.`);
}

/** The provider for new connections (based on .env). */
function configuredProvider(platform: SocialPlatform): ServerProvider | null {
  if (platform === 'Instagram') return instagramProvider.configured() ? instagramProvider : null;
  if (tiktokBusinessProvider.configured()) return tiktokBusinessProvider;
  if (tiktokDisplayProvider.configured()) return tiktokDisplayProvider;
  return null;
}

/** The provider that issued a stored token. */
function providerForToken(token: StoredToken): ServerProvider {
  if (token.mode === 'meta_business_suite') return metaBusinessSuiteProvider;
  if (token.mode === 'tiktok_studio') return tiktokStudioProvider;
  if (token.mode === 'instagram_login') return instagramProvider;
  return token.mode === 'tiktok_business' ? tiktokBusinessProvider : tiktokDisplayProvider;
}

/** Provider for pasted tokens: configured one, else a sensible default. */
function pasteProvider(platform: SocialPlatform, hasOpenId: boolean): ServerProvider {
  const p = configuredProvider(platform);
  if (p) return p;
  if (platform === 'Instagram') return instagramProvider;
  return hasOpenId ? tiktokBusinessProvider : tiktokDisplayProvider;
}

function status(platform: SocialPlatform): IntegrationStatus {
  const token = tokenStore.get(platform);
  const provider = configuredProvider(platform);
  return {
    platform,
    configured: !!provider,
    connected: !!token,
    mode: token?.mode ?? provider?.mode ?? null,
    accountName: token?.accountName,
    accountId: token?.accountId,
    tokenExpiresAt: token?.expiresAt,
    connectedAt: token?.connectedAt,
    oauthAvailable: !!provider && provider.oauthReady(),
    error: token?.error,
    browserAvailable: browserAvailable(),
    nextAutoSyncAt: token && browserProviders[platform].mode === token.mode ? nextAutoSync(platform) : undefined,
    historySince: token && browserProviders[platform].mode === token.mode ? readScrape(platform)?.historySince : undefined,
  };
}

/* ---------------- Browser connections (no token) ---------------- */

const browserProviders: Record<SocialPlatform, BrowserProvider> = {
  Instagram: metaBusinessSuiteProvider,
  TikTok: tiktokStudioProvider,
};

/** Background sync interval for browser connections (hours, min 1, default 6). */
const AUTO_SYNC_MS = Math.max(1, Number(env('BROWSER_SYNC_HOURS') ?? 6) || 6) * 3600_000;

function nextAutoSync(platform: SocialPlatform): string {
  const last = readScrape(platform)?.scrapedAt;
  return new Date(Math.max(Date.now(), (last ? Date.parse(last) : 0) + AUTO_SYNC_MS)).toISOString();
}

/** Runs every 10 min; scrapes each browser-connected platform once its interval has passed. */
async function autoSyncTick() {
  for (const platform of SOCIAL_PLATFORMS) {
    const token = tokenStore.get(platform);
    const provider = browserProviders[platform];
    if (!token || token.mode !== provider.mode || Date.parse(nextAutoSync(platform)) > Date.now()) continue;
    try {
      await provider.refresh({ force: true });
      if (token.error) tokenStore.update(platform, { error: undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[browser] ${platform} auto-sync failed: ${message}`);
      if (err instanceof ApiError && err.code === 'token_expired') tokenStore.update(platform, { error: message });
    }
  }
}

/** Load + refresh the token; remember token errors so Settings can show them. */
async function useToken(platform: SocialPlatform): Promise<{ token: StoredToken; provider: ServerProvider }> {
  const stored = tokenStore.get(platform);
  if (!stored) throw new ApiError('not_connected', `${platform} is not connected. Connect it in Settings → Integrations.`);
  const provider = providerForToken(stored);
  try {
    const token = await provider.ensureFresh(stored);
    if (token.error) tokenStore.update(platform, { error: undefined });
    return { token, provider };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'token_expired') tokenStore.update(platform, { error: err.message });
    throw err;
  }
}

async function withTokenErrors<T>(platform: SocialPlatform, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'token_expired') tokenStore.update(platform, { error: err.message });
    throw err;
  }
}

function parseRange(c: Context): DateRange {
  const since = c.req.query('since');
  const until = c.req.query('until');
  if (!isISODate(since) || !isISODate(until)) throw new ApiError('bad_request', 'since and until must be dates in YYYY-MM-DD format.');
  if (since > until) throw new ApiError('bad_request', 'since must be on or before until.');
  if (until > addDaysUTC(new Date().toISOString().slice(0, 10), 1)) throw new ApiError('bad_request', 'until cannot be in the future.');
  return { since, until };
}

/* ---------------- OAuth state (in memory, 10 min) ---------------- */

const STATE_TTL = 10 * 60_000;
const pendingStates = new Map<string, { platform: SocialPlatform; createdAt: number }>();

function newState(platform: SocialPlatform): string {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (now - v.createdAt > STATE_TTL) pendingStates.delete(k);
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, { platform, createdAt: now });
  return state;
}

function takeState(state: string | undefined, platform: SocialPlatform): boolean {
  if (!state) return false;
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  return !!entry && entry.platform === platform && Date.now() - entry.createdAt <= STATE_TTL;
}

/* ---------------- Routes ---------------- */

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(err.toBody(), err.status as 400);
  console.error('[api] unexpected error:', err instanceof Error ? err.message : err);
  return c.json({ error: { code: 'internal', message: 'Unexpected server error. Check the API terminal for details.' } }, 500);
});

app.notFound((c) => c.json({ error: { code: 'bad_request', message: `No route for ${c.req.method} ${c.req.path}` } }, 404));

app.get('/api/health', (c) => c.json({ ok: true }));

// Shared workspace lives on the hosted site (api/workspace.ts). With WORKSPACE_URL
// set, the local app edits that same content plan instead of its own localStorage.
app.all('/api/workspace', async (c) => {
  const base = env('WORKSPACE_URL')?.replace(/\/+$/, '');
  if (!base) throw new ApiError('not_configured', 'No shared workspace: set WORKSPACE_URL in .env to use the hosted one.', { status: 404 });
  const url = new URL(c.req.url);
  const res = await safeFetchWorkspace(`${base}/api/workspace${url.search}`, {
    method: c.req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(c.req.header('x-edit-code') ? { 'x-edit-code': c.req.header('x-edit-code')! } : {}),
    },
    body: c.req.method === 'GET' ? undefined : await c.req.text(),
  });
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});

async function safeFetchWorkspace(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError('platform_error', `Can't reach the shared workspace at ${env('WORKSPACE_URL')}.`);
  }
}

app.get('/api/integrations', (c) => {
  const body: IntegrationsResponse = { integrations: [status('Instagram'), status('TikTok')] };
  return c.json(body);
});

app.get('/api/auth/:platform/start', (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const provider = configuredProvider(platform);
  if (!provider) throw new ApiError('not_configured', `${platform} app credentials are missing in .env. See README → “Menghubungkan Instagram & TikTok”.`);
  if (!provider.oauthReady()) {
    throw new ApiError('not_configured', `Set PUBLIC_URL (an https address, e.g. a tunnel) in .env to use ${platform} login${provider.mode === 'tiktok_business' ? ' and TIKTOK_BUSINESS_AUTH_URL' : ''}, or paste an access token instead.`);
  }
  return c.redirect(provider.authorizeUrl(newState(platform)), 302);
});

async function oauthCallback(c: Context) {
  const raw = c.req.param('platform') ?? '';
  const back = (query: string) => c.redirect(`${appUrl()}/#/settings?${query}`, 302);
  try {
    const platform = parsePlatform(raw);
    const params = new URL(c.req.url).searchParams;
    const denied = params.get('error_description') ?? params.get('error_reason') ?? params.get('error');
    if (denied) throw new ApiError('permission', `${platform} login was cancelled or denied: ${denied}`);
    if (!takeState(params.get('state') ?? undefined, platform)) throw new ApiError('bad_request', 'The login link expired or was opened twice. Please click Connect again.');
    const provider = configuredProvider(platform);
    if (!provider) throw new ApiError('not_configured', `${platform} app credentials are missing in .env.`);
    tokenStore.set(await provider.exchangeCode(params));
    return back(`connected=${raw.toLowerCase()}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return back(`oauth_error=${encodeURIComponent(message)}`);
  }
}
app.get('/api/auth/:platform/callback', oauthCallback);
// TikTok Business requires a redirect URI ending in "/".
app.get('/api/auth/:platform/callback/', oauthCallback);

app.post('/api/auth/:platform/token', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const body = (await c.req.json().catch(() => ({}))) as { accessToken?: unknown; refreshToken?: unknown; openId?: unknown };
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  if (accessToken.length < 20) throw new ApiError('bad_request', 'Paste a valid access token.');
  const refreshToken = typeof body.refreshToken === 'string' && body.refreshToken.trim() ? body.refreshToken.trim() : undefined;
  const openId = typeof body.openId === 'string' && body.openId.trim() ? body.openId.trim() : undefined;
  const provider = pasteProvider(platform, !!openId);
  tokenStore.set(await provider.fromPastedToken(accessToken, refreshToken, openId));
  return c.json(status(platform));
});

// Opens a visible Chrome window; the request finishes when the user closes it.
app.post('/api/browser/:platform/login', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  await browserProviders[platform].login();
  return c.json(status(platform));
});

app.delete('/api/integrations/:platform', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const token = tokenStore.get(platform);
  if (token) {
    try {
      await providerForToken(token).revoke?.(token);
    } catch {
      /* revoke is best effort */
    }
    tokenStore.remove(platform);
  }
  return c.json(status(platform));
});

app.get('/api/:platform/account', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const range = parseRange(c);
  const { token, provider } = await useToken(platform);
  return c.json(await withTokenErrors(platform, () => provider.account(token, range)));
});

app.get('/api/:platform/media', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const range = parseRange(c);
  const { token, provider } = await useToken(platform);
  return c.json(await withTokenErrors(platform, () => provider.media(token, range)));
});

const POST_TYPES: PostType[] = ['Reels', 'Carousel', 'Static', 'Story', 'Video'];

app.post('/api/:platform/media-insights', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const body = (await c.req.json().catch(() => ({}))) as { posts?: unknown };
  if (!Array.isArray(body.posts)) throw new ApiError('bad_request', 'Body must be { posts: [{ mediaId, type }] }.');
  const refs: MediaRef[] = body.posts
    .filter((p): p is { mediaId: string; type?: string } => !!p && typeof (p as any).mediaId === 'string')
    .map((p) => ({ mediaId: p.mediaId, type: POST_TYPES.includes(p.type as PostType) ? (p.type as PostType) : 'Static' }));
  if (refs.length > 500) throw new ApiError('bad_request', 'Send at most 500 posts per request.');
  const { token, provider } = await useToken(platform);
  return c.json(await withTokenErrors(platform, () => provider.mediaInsights(token, refs)));
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  const ig = status('Instagram');
  const tt = status('TikTok');
  const describe = (s: IntegrationStatus) => (s.connected ? `connected (${s.mode})` : s.configured ? `configured, not connected (${s.mode})` : 'not configured → demo data');
  console.log(`[api] KARDEUCE insights API on http://localhost:${info.port}`);
  console.log(`[api] Instagram: ${describe(ig)} · TikTok: ${describe(tt)}`);
  setInterval(() => void autoSyncTick(), 10 * 60_000);
  setTimeout(() => void autoSyncTick(), 15_000);
});

