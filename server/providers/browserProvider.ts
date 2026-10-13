import type { BrowserContext } from 'playwright-core';
import type { AccountDayInput, IntegrationMode, PostInput, SocialPlatform } from '../../shared/insights.ts';
import { ApiError } from '../errors.ts';
import { todayUTC } from '../dates.ts';
import { browserAvailable, clearProfile, focusChrome, headless, interactiveLogin, launch, withProfileLock } from '../browser/chrome.ts';
import { clearFailure, readFailure, readLastFailure, readScrape, writeFailure, writeScrape, type ScrapeResult } from '../browser/cache.ts';
import { scrapeAccount, scrapeMedia, scrapeMediaInsights } from '../../shared/scrape.ts';
import { publishLiveData } from '../publish.ts';
import { tokenStore, type StoredToken } from '../tokenStore.ts';
import type { ServerProvider } from './types.ts';

export interface ScrapeOutput {
  accountName?: string;
  accountId?: string;
  followersNow?: number;
  posts: PostInput[];
  /** Daily account history, when the dashboard offers it. */
  days?: AccountDayInput[];
  /** First day the history covers (YYYY-MM-DD). */
  historySince?: string;
  warnings: string[];
}

export interface BrowserScraper {
  platform: SocialPlatform;
  mode: IntegrationMode;
  label: string;
  /** Pages opened in the login window; the first is required. */
  loginUrls: string[];
  isLoggedIn(ctx: BrowserContext): Promise<boolean>;
  scrape(ctx: BrowserContext): Promise<ScrapeOutput>;
}

/** Reuse a scrape this recent instead of opening Chrome again (one sync calls account + media + insights). */
const REUSE_MS = 15 * 60_000;
/** A scrape that takes longer is stuck (a page that never answers): close Chrome and fail. */
const SCRAPE_TIMEOUT_MS = 5 * 60_000;
/**
 * After a failed scrape, answer with the same error this long (one sync calls
 * refresh three times); a rate limit is held until its retry time. Kept on disk
 * (server/.data) so a server restart doesn't retry right away.
 */
const FAIL_REUSE_MS = 2 * 60_000;
/** Longest pause after repeated rate limits. */
const MAX_RATE_LIMIT_PAUSE_MS = 24 * 3600_000;

function withTimeout<T>(task: Promise<T>, ms: number, onTimeout: () => void, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new ApiError('platform_error', message));
    }, ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

export interface BrowserProvider extends ServerProvider {
  platform: SocialPlatform;
  /** Opens a visible Chrome window for the user to log in; stores the connection. */
  login(): Promise<StoredToken>;
  /** Scrape now (or reuse a very recent scrape) and save the result. */
  refresh(opts?: { force?: boolean }): Promise<ScrapeResult>;
}

export function browserProvider(s: BrowserScraper): BrowserProvider {
  let inFlight: Promise<ScrapeResult> | null = null;
  let loginInFlight: Promise<StoredToken> | null = null;

  const runScrape = () =>
    withProfileLock(s.platform, async () => {
      const ctx = await launch(s.platform, { headless: headless() });
      try {
        if (!(await s.isLoggedIn(ctx))) {
          throw new ApiError('token_expired', `${s.label} login has expired. Click “Connect via browser” in Settings → Integrations and log in again.`);
        }
        const out = await withTimeout(
          s.scrape(ctx),
          SCRAPE_TIMEOUT_MS,
          () => void ctx.close().catch(() => undefined),
          `${s.label}: sync took longer than ${SCRAPE_TIMEOUT_MS / 60_000} minutes and was stopped. It will retry on the next sync.`,
        );
        const prev = readScrape(s.platform);
        const result: ScrapeResult = {
          scrapedAt: new Date().toISOString(),
          followersNow: out.followersNow,
          followersByDay: { ...prev?.followersByDay, ...(out.followersNow !== undefined ? { [todayUTC()]: out.followersNow } : {}) },
          days: { ...prev?.days, ...Object.fromEntries((out.days ?? []).map((d) => [d.date, d])) },
          historySince: out.historySince ?? prev?.historySince,
          posts: out.posts,
          warnings: out.warnings,
        };
        if (!out.posts.length && prev?.posts.length) {
          // A page change shouldn't wipe what we had; keep the old posts and say so.
          result.posts = prev.posts;
          result.warnings.push(`${s.label}: no posts found this time (the page layout may have changed); showing posts from the previous sync.`);
        }
        writeScrape(s.platform, result);
        const token = tokenStore.get(s.platform);
        if (token?.mode === s.mode && out.accountName && out.accountName !== token.accountName) tokenStore.update(s.platform, { accountName: out.accountName });
        console.log(`[browser] ${s.platform}: ${result.posts.length} posts, followers ${result.followersNow ?? '?'}`);
        publishLiveData();
        return result;
      } finally {
        await ctx.close().catch(() => undefined);
      }
    });

  const refresh = async ({ force = false } = {}) => {
    const cached = readScrape(s.platform);
    if (!force && cached && Date.now() - Date.parse(cached.scrapedAt) < REUSE_MS) return cached;
    const failure = readFailure(s.platform);
    // "Sync now" may retry other failures, but never a rate limit before it expires.
    if (failure && (failure.code === 'rate_limited' || !force)) {
      const left = Math.max(60, Math.ceil((Date.parse(failure.until) - Date.now()) / 1000));
      throw new ApiError(failure.code, failure.message, failure.code === 'rate_limited' ? { retryAfter: left } : {});
    }
    inFlight ??= runScrape()
      .then(
        (r) => {
          clearFailure(s.platform);
          return r;
        },
        (err) => {
          // Unexpected errors keep the generic message app.onError would show.
          const e = err instanceof ApiError ? err : new ApiError('internal', 'Unexpected server error. Check the API terminal for details.');
          // Rate limited again right after a pause: the platform is still blocking, so wait longer each time.
          const prev = readLastFailure(s.platform);
          const strikes = e.code === 'rate_limited' ? (prev?.code === 'rate_limited' ? (prev.strikes ?? 1) : 0) + 1 : undefined;
          const pauseMs = strikes ? Math.min((e.retryAfter ?? 3600) * 1000 * 2 ** (strikes - 1), MAX_RATE_LIMIT_PAUSE_MS) : FAIL_REUSE_MS;
          const message = strikes && strikes > 1 ? `${e.message} Still blocked after ${strikes} tries, so syncing pauses for ${Math.round(pauseMs / 3600_000)}h.` : e.message;
          writeFailure(s.platform, { until: new Date(Date.now() + pauseMs).toISOString(), code: e.code, message, strikes });
          throw err;
        },
      )
      .finally(() => (inFlight = null));
    return inFlight;
  };

  const doLogin = async (): Promise<StoredToken> => {
    const ok = await interactiveLogin(s.platform, s.loginUrls, s.isLoggedIn);
    if (!ok) throw new ApiError('permission', `${s.label}: login was not finished. Log in in the Chrome window, then close it.`);
    const now = new Date().toISOString();
    const token: StoredToken = {
      platform: s.platform,
      mode: s.mode,
      accessToken: '',
      issuedAt: now,
      accountId: '',
      accountName: '',
      connectedAt: now,
    };
    tokenStore.set(token);
    // A new login fixes an expired session, not a rate limit: retrying early only extends the block.
    // Also keeps an expired one, so the next rate limit still counts as a repeat and pauses longer.
    if (readLastFailure(s.platform)?.code !== 'rate_limited') clearFailure(s.platform);
    // First scrape right away so the account name shows up in Settings.
    try {
      await refresh({ force: true });
    } catch (err) {
      console.warn(`[browser] ${s.platform}: first sync failed:`, err instanceof Error ? err.message : err);
    }
    return tokenStore.get(s.platform) ?? token;
  };

  const noToken = () => new ApiError('bad_request', `${s.label} connects through the browser and doesn't use tokens.`);

  return {
    platform: s.platform,
    mode: s.mode,
    label: s.label,
    configured: browserAvailable,
    oauthReady: () => false,
    redirectUri: () => null,
    authorizeUrl: () => {
      throw noToken();
    },
    exchangeCode: async () => {
      throw noToken();
    },
    fromPastedToken: async () => {
      throw noToken();
    },
    ensureFresh: async (token) => token,
    revoke: () => clearProfile(s.platform),

    login() {
      // A second click while the window is open: show that window again instead
      // of queueing a new one behind the profile lock.
      if (loginInFlight) {
        void focusChrome(s.platform);
        return loginInFlight;
      }
      loginInFlight = doLogin().finally(() => (loginInFlight = null));
      return loginInFlight;
    },

    refresh,

    async account(_token, range) {
      return scrapeAccount(await refresh(), s.platform, s.label, range);
    },

    async media(_token, range) {
      return scrapeMedia(await refresh(), range);
    },

    async mediaInsights(_token, refs) {
      return scrapeMediaInsights(await refresh(), refs.map((x) => x.mediaId));
    },
  };
}
