/**
 * Insight data shapes shared by the browser app (src/) and the API server
 * (server/). Plain serialisable data only — no runtime code that depends on
 * either environment.
 *
 * Convention: a metric that a platform does not provide is `undefined`
 * (rendered as "—"), never 0. A real 0 means the platform reported zero.
 */

export type SocialPlatform = 'Instagram' | 'TikTok';
export const SOCIAL_PLATFORMS: SocialPlatform[] = ['Instagram', 'TikTok'];

export type ISODateString = string; // YYYY-MM-DD

export interface DateRange {
  since: ISODateString; // inclusive
  until: ISODateString; // inclusive
}

/** Per-post metrics. Every field is optional on purpose (see header). */
export interface PostMetrics {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  /** Instagram "saved" / TikTok "favorites". */
  saves?: number;
  /** As reported by the platform (Instagram total_interactions). */
  totalInteractions?: number;
  profileVisits?: number;
  /** Follows attributed to the post (IG follows / TikTok new_followers). */
  follows?: number;
  /** Seconds. */
  avgWatchTime?: number;
  /** Seconds. */
  totalWatchTime?: number;
  /** Full-watch rate, 0–100 (TikTok). */
  completionRate?: number;
  /** Reels skip rate, 0–100 (Instagram). */
  skipRate?: number;
  /** Instagram Story replies. */
  storyReplies?: number;
  /** Instagram Story navigation, by action (tap_forward, tap_back, tap_exit, swipe_forward). */
  storyNavigation?: Record<string, number>;
  /** TikTok traffic sources, % by source (For You, Follow, Profile, Search, Sound, Hashtag…). */
  trafficSources?: Record<string, number>;
}

/** Normalised post type. Matches the app's content types where possible. */
export type PostType = 'Reels' | 'Carousel' | 'Static' | 'Story' | 'Video';

export interface PostInput {
  platform: SocialPlatform;
  mediaId: string;
  permalink: string;
  type: PostType;
  /** Full ISO timestamp with offset, e.g. 2026-10-02T12:05:00+0000. */
  publishedAt: string;
  caption: string;
  thumbnail: string;
  metrics: PostMetrics;
}

/** One platform, one calendar day. Missing values stay undefined. */
export interface AccountDayInput {
  platform: SocialPlatform;
  date: ISODateString;
  followers?: number;
  netFollowers?: number;
  reach?: number;
  views?: number;
  profileVisits?: number;
  accountsEngaged?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  interactions?: number;
  linkClicks?: number;
}

export interface AccountInsightsResponse {
  /** Lifetime follower count right now (used to rebuild follower history). */
  followersNow?: number;
  days: AccountDayInput[];
  /** Human-readable notes about what the API could not return. */
  warnings: string[];
}

export interface MediaListResponse {
  posts: PostInput[];
  warnings: string[];
}

export interface MediaInsightsResponse {
  /** mediaId → metrics. Ids that failed are omitted and explained in warnings. */
  metrics: Record<string, PostMetrics>;
  warnings: string[];
}

/**
 * `*_login` / `tiktok_*` modes use official APIs with tokens. `tiktok_studio`
 * and `meta_business_suite` read the logged-in web dashboards through a local
 * Chrome profile instead (no token, no developer app).
 */
export type IntegrationMode = 'instagram_login' | 'tiktok_business' | 'tiktok_display' | 'tiktok_studio' | 'meta_business_suite';

export interface IntegrationStatus {
  platform: SocialPlatform;
  /** App credentials for this platform exist in the server .env. */
  configured: boolean;
  /** A usable token is stored on the server. */
  connected: boolean;
  mode: IntegrationMode | null;
  accountName?: string;
  accountId?: string;
  /** ISO timestamp, or undefined when unknown. */
  tokenExpiresAt?: string;
  connectedAt?: string;
  /** Can the server start an OAuth flow (redirect URI configured)? */
  oauthAvailable: boolean;
  /** Last token problem the server ran into (expired, revoked…). */
  error?: string;
  /** Chrome was found, so "Connect via browser" (no token) can be used. */
  browserAvailable: boolean;
  /** Browser mode: next scheduled background sync (ISO). */
  nextAutoSyncAt?: string;
}

export interface IntegrationsResponse {
  integrations: IntegrationStatus[];
}

export interface ApiErrorBody {
  error: {
    code: 'not_connected' | 'not_configured' | 'rate_limited' | 'token_expired' | 'permission' | 'platform_error' | 'bad_request' | 'internal';
    message: string;
    /** Seconds to wait before retrying (rate limits). */
    retryAfter?: number;
  };
}
