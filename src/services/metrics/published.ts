import { SOCIAL_PLATFORMS, type IntegrationStatus, type SocialPlatform } from '@shared/insights';
import { PUBLISHED_DATA_FILE, type PublishedData, type ScrapeResult } from '@shared/scrape';

/**
 * Hosted dashboard without the API server: the local server publishes its
 * latest scrapes as /live-data.json (server/publish.ts). Read-only.
 */
let current: PublishedData | null = null;

/** Fetch the published data; null when the site has none (local dev, demo deploys). */
export async function loadPublished(): Promise<PublishedData | null> {
  try {
    const res = await fetch(`/${PUBLISHED_DATA_FILE}`, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    const data = (await res.json()) as PublishedData;
    current = data?.version === 1 && data.platforms ? data : null;
  } catch {
    current = null;
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
