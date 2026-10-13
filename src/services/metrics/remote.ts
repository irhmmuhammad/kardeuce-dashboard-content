import type { AccountInsightsResponse, IntegrationStatus, MediaInsightsResponse, MediaListResponse, SocialPlatform } from '@shared/insights';
import type { MetricsProvider } from './types';
import { api } from './api';

export const platformSlug = (p: SocialPlatform) => (p === 'Instagram' ? 'instagram' : 'tiktok');

/** TikTok launched internationally in 2017: no account history before this. */
const EARLIEST = '2016-09-01';

/** Instagram / TikTok provider: thin client over the /api server. */
export function remoteProvider(integration: IntegrationStatus): MetricsProvider {
  const slug = platformSlug(integration.platform);
  return {
    platform: integration.platform,
    kind: slug,
    listIncludesInsights: integration.mode === 'tiktok_business' || integration.mode === 'tiktok_studio' || integration.mode === 'meta_business_suite',
    fullHistorySince: integration.mode === 'tiktok_studio' ? (integration.historySince ?? EARLIEST) : undefined,
    getAccountInsights: (range) => api<AccountInsightsResponse>(`/${slug}/account?since=${range.since}&until=${range.until}`),
    listMedia: (range) => api<MediaListResponse>(`/${slug}/media?since=${range.since}&until=${range.until}`),
    getMediaInsights: (posts) => api<MediaInsightsResponse>(`/${slug}/media-insights`, { method: 'POST', body: JSON.stringify({ posts }) }),
  };
}
