import type { BrowserContext } from 'playwright-core';
import type { AccountDayInput, IntegrationMode, PostInput, SocialPlatform } from '../../shared/insights.ts';
import { ApiError } from '../errors.ts';
import { todayUTC } from '../dates.ts';
import { browserAvailable, clearProfile, headless, interactiveLogin, launch, withProfileLock } from '../browser/chrome.ts';
import { readScrape, writeScrape, type ScrapeResult } from '../browser/cache.ts';
import { tokenStore, type StoredToken } from '../tokenStore.ts';
import type { ServerProvider } from './types.ts';

export interface ScrapeOutput {
  accountName?: string;
  accountId?: string;
  followersNow?: number;
  posts: PostInput[];
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

export interface BrowserProvider extends ServerProvider {
  platform: SocialPlatform;
  /** Opens a visible Chrome window for the user to log in; stores the connection. */
  login(): Promise<StoredToken>;
  /** Scrape now (or reuse a very recent scrape) and save the result. */
  refresh(opts?: { force?: boolean }): Promise<ScrapeResult>;
}

export function browserProvider(s: BrowserScraper): BrowserProvider {
  let inFlight: Promise<ScrapeResult> | null = null;

  const runScrape = () =>
    withProfileLock(s.platform, async () => {
      const ctx = await launch(s.platform, { headless: headless() });
      try {
        if (!(await s.isLoggedIn(ctx))) {
          throw new ApiError('token_expired', `${s.label} login has expired. Click “Connect via browser” in Settings → Integrations and log in again.`);
        }
        const out = await s.scrape(ctx);
        const prev = readScrape(s.platform);
        const result: ScrapeResult = {
          scrapedAt: new Date().toISOString(),
          followersNow: out.followersNow,
          followersByDay: { ...prev?.followersByDay, ...(out.followersNow !== undefined ? { [todayUTC()]: out.followersNow } : {}) },
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
        return result;
      } finally {
        await ctx.close().catch(() => undefined);
      }
    });

  const refresh = async ({ force = false } = {}) => {
    const cached = readScrape(s.platform);
    if (!force && cached && Date.now() - Date.parse(cached.scrapedAt) < REUSE_MS) return cached;
    inFlight ??= runScrape().finally(() => (inFlight = null));
    return inFlight;
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

    async login() {
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
      // First scrape right away so the account name shows up in Settings.
      try {
        await refresh({ force: true });
      } catch (err) {
        console.warn(`[browser] ${s.platform}: first sync failed:`, err instanceof Error ? err.message : err);
      }
      return tokenStore.get(s.platform) ?? token;
    },

    refresh,

    async account(_token, range) {
      const r = await refresh();
      const days: AccountDayInput[] = Object.entries(r.followersByDay)
        .filter(([d]) => d >= range.since && d <= range.until)
        .map(([date, followers]) => ({ platform: s.platform, date, followers }));
      const warnings = [`${s.label}: daily reach/views aren't read from the dashboard yet; follower history builds up from each sync.`];
      return { followersNow: r.followersNow, days, warnings };
    },

    async media(_token, range) {
      const r = await refresh();
      const posts = r.posts.filter((p) => {
        const d = p.publishedAt.slice(0, 10);
        return d >= range.since && d <= range.until;
      });
      return { posts, warnings: r.warnings };
    },

    async mediaInsights(_token, refs) {
      const r = await refresh();
      const byId = new Map(r.posts.map((p) => [p.mediaId, p.metrics]));
      const metrics = Object.fromEntries(refs.filter((x) => byId.has(x.mediaId)).map((x) => [x.mediaId, byId.get(x.mediaId)!]));
      return { metrics, warnings: [] };
    },
  };
}
