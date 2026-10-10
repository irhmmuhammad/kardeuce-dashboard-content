import type {
  AccountInsightsResponse,
  DateRange,
  MediaInsightsResponse,
  MediaListResponse,
  PostType,
  SocialPlatform,
} from '@shared/insights';

/**
 * One interface for every metrics source. The Instagram and TikTok providers
 * call our own /api server (tokens never reach the browser); the mock
 * provider generates deterministic demo data locally.
 */
export interface MetricsProvider {
  platform: SocialPlatform;
  kind: 'instagram' | 'tiktok' | 'mock';
  /** True when listMedia already returns full insights (TikTok Business), so getMediaInsights can be skipped. */
  listIncludesInsights: boolean;
  getAccountInsights(range: DateRange): Promise<AccountInsightsResponse>;
  listMedia(range: DateRange): Promise<MediaListResponse>;
  getMediaInsights(posts: { mediaId: string; type: PostType }[]): Promise<MediaInsightsResponse>;
}
