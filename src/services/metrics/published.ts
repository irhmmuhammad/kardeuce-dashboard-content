import { SOCIAL_PLATFORMS, type IntegrationStatus, type SocialPlatform } from '@shared/insights';
import { PUBLISHED_DATA_FILE, type PublishedData, type ScrapeResult } from '@shared/scrape';

/**
 * Hosted dashboard without the API server: the local server publishes its
 * latest scrapes as /live-data.json (server/publish.ts). Read-only.
 */
let current: PublishedData | null = null;

const INSTAGRAM_ENDPOINT = '/api/instagram-data';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch the published data; null when the site has none (local dev, demo
 * deploys). Instagram comes straight from the official API when the site has
 * it set up (api/instagram-data.ts) and replaces any published copy.
 */
export async function loadPublished(opts: { force?: boolean } = {}): Promise<PublishedData | null> {
  const [published, instagram] = await Promise.all([
    getJson<PublishedData>(`/${PUBLISHED_DATA_FILE}`),
    getJson<NonNullable<PublishedData['platforms']['Instagram']>>(opts.force ? `${INSTAGRAM_ENDPOINT}?force=1` : INSTAGRAM_ENDPOINT),
  ]);
  const data: PublishedData | null = published?.version === 1 && published.platforms ? published : null;
  if (instagram?.integration && instagram.scrape) {
    current = { version: 1, publishedAt: data?.publishedAt ?? instagram.scrape.scrapedAt, platforms: { ...data?.platforms, Instagram: instagram } };
  } else {
    current = data;
  }
  return current;
}

/** Integration list for the hosted site: published platforms are connected, the rest stay demo. */
export function publishedIntegrations(data: PublishedData): IntegrationStatus[] {
  return SOCIAL_PLATFORMS.map(
    (platform) =>
      data.platforms[platform]?.integration ?? { platform, configured: false, connected: false, mode: null, oauthAvailable: false, browserAvailable: false },
  );
}

export function publishedScrape(platform: SocialPlatform): ScrapeResult {
  const scrape = current?.platforms[platform]?.scrape;
  if (!scrape) throw new Error(`No published ${platform} data on this site.`);
  return scrape;
}
