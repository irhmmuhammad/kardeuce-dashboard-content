import type {
  AccountDayInput,
  AccountInsightsResponse,
  DateRange,
  IntegrationStatus,
  MediaInsightsResponse,
  MediaListResponse,
  PostInput,
  SocialPlatform,
} from './insights.ts';

/**
 * Last scrape of a browser connection (TikTok Studio / Meta Business Suite).
 * The server keeps it in server/.data; the same shape is published for the
 * hosted, read-only dashboard (see PublishedData).
 */
export interface ScrapeResult {
  scrapedAt: string;
  followersNow?: number;
  /** YYYY-MM-DD → follower count seen that day (last scrape of the day wins). */
  followersByDay: Record<string, number>;
  /** YYYY-MM-DD → daily account numbers read from the dashboard (TikTok Studio). */
  days?: Record<string, AccountDayInput>;
  /** First day the history covers (account creation), YYYY-MM-DD. */
  historySince?: string;
  posts: PostInput[];
  warnings: string[];
}

/**
 * Snapshot the local server pushes to the repo after each scrape, so the
 * hosted site (no server) can show real numbers. Served at /PUBLISHED_DATA_FILE.
 */
export interface PublishedData {
  version: 1;
  publishedAt: string;
  platforms: Partial<Record<SocialPlatform, { integration: IntegrationStatus; scrape: ScrapeResult }>>;
}

export const PUBLISHED_DATA_FILE = 'live-data.json';

/* ---------------- Answering account / media / insights from a scrape ---------------- */

export function scrapeAccount(r: ScrapeResult, platform: SocialPlatform, label: string, range: DateRange): AccountInsightsResponse {
  // Dashboard history first; follower counts seen by our own syncs fill the gaps (e.g. today).
  const byDate = new Map<string, AccountDayInput>(Object.entries(r.days ?? {}).map(([date, d]) => [date, { ...d }]));
  for (const [date, followers] of Object.entries(r.followersByDay)) {
    const day = byDate.get(date) ?? { platform, date };
    day.followers ??= followers;
    byDate.set(date, day);
  }
  const days = [...byDate.values()].filter((d) => d.date >= range.since && d.date <= range.until).sort((a, b) => a.date.localeCompare(b.date));
  const warnings = r.days ? [] : [`${label}: daily reach/views aren't read from the dashboard yet; follower history builds up from each sync.`];
  return { followersNow: r.followersNow, days, warnings };
}

export function scrapeMedia(r: ScrapeResult, range: DateRange): MediaListResponse {
  const posts = r.posts.filter((p) => {
    const d = p.publishedAt.slice(0, 10);
    return d >= range.since && d <= range.until;
  });
  return { posts, warnings: r.warnings };
}

export function scrapeMediaInsights(r: ScrapeResult, mediaIds: string[]): MediaInsightsResponse {
  const byId = new Map(r.posts.map((p) => [p.mediaId, p.metrics]));
  const metrics = Object.fromEntries(mediaIds.filter((id) => byId.has(id)).map((id) => [id, byId.get(id)!]));
  return { metrics, warnings: [] };
}
