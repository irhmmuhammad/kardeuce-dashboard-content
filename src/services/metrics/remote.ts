import type { AccountInsightsResponse, IntegrationStatus, MediaInsightsResponse, MediaListResponse, SocialPlatform } from '@shared/insights';
import type { MetricsProvider } from './types';
import { scrapeAccount, scrapeMedia, scrapeMediaInsights } from '@shared/scrape';
import { api } from './api';
import { publishedScrape } from './published';

export const platformSlug = (p: SocialPlatform): 'instagram' | 'tiktok' => (p === 'Instagram' ? 'instagram' : 'tiktok');

/** TikTok launched internationally in 2017: no account history before this. */
const EARLIEST = '2016-09-01';

/**
 * Instagram / TikTok provider: thin client over the /api server, or over the
 * published data on the hosted site (integration.snapshotAt set).
 */
export function remoteProvider(integration: IntegrationStatus): MetricsProvider {
  const slug = platformSlug(integration.platform);
  const base = {
    platform: integration.platform,
    kind: slug,
    listIncludesInsights: integration.mode === 'tiktok_business' || integration.mode === 'tiktok_studio' || integration.mode === 'meta_business_suite',
    // Sources that serve their whole history from a cache: every sync reads all of it.
    fullHistorySince:
      integration.mode === 'tiktok_studio'
        ? (integration.historySince ?? EARLIEST)
        : integration.mode === 'instagram_login' && integration.snapshotAt
          ? integration.historySince
          : undefined,
  };
  if (integration.snapshotAt) {
    const label = integration.mode === 'tiktok_studio' ? 'TikTok Studio' : 'Meta Business Suite';
    return {
      ...base,
      getAccountInsights: async (range) => scrapeAccount(publishedScrape(integration.platform), integration.platform, label, range),
      listMedia: async (range) => scrapeMedia(publishedScrape(integration.platform), range),
      getMediaInsights: async (posts) => scrapeMediaInsights(publishedScrape(integration.platform), posts.map((p) => p.mediaId)),
    };
  }
  return {
    ...base,
    getAccountInsights: (range) => api<AccountInsightsResponse>(`/${slug}/account?since=${range.since}&until=${range.until}`),
    listMedia: (range) => api<MediaListResponse>(`/${slug}/media?since=${range.since}&until=${range.until}`),
    getMediaInsights: (posts) => api<MediaInsightsResponse>(`/${slug}/media-insights`, { method: 'POST', body: JSON.stringify({ posts }) }),
  };
}
