/**
 * Domain model for the KARDEUCE Content Hub.
 *
 * Everything here is plain, serialisable data so it can be stored as-is in
 * localStorage today and mapped 1:1 to Supabase / Firebase / PostgreSQL rows
 * later (see src/data/adapters).
 */

import type { PostMetrics, PostType, SocialPlatform } from '@shared/insights';

export type { PostMetrics, PostType, SocialPlatform } from '@shared/insights';

export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

export interface ContentMetrics {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followersGained: number;
}

/**
 * Metrics for one platform of one content item.
 *  - source 'manual': typed in by the team (never overwritten without asking)
 *  - source 'api' / 'mock': copied from the linked synced post
 */
export interface PlatformMetricSet {
  values: PostMetrics;
  source: 'manual' | 'api' | 'mock';
  /** Set when the team chose to keep manual numbers over synced ones. */
  keepManual?: boolean;
  mediaId?: string;
  permalink?: string;
  syncedAt?: string;
}

export type PlatformMetrics = Partial<Record<SocialPlatform, PlatformMetricSet>>;

export interface ContentItem {
  id: string;
  publishDate: ISODate | '';
  platform: string[];
  contentType: string;
  contentPillar: string;
  title: string;
  brief: string;
  hook: string;
  script: string;
  caption: string;
  cta: string;
  references: string[];
  coverImage: string;
  contentUrl: string;
  status: string;
  objective: string;
  kpi: string;
  owner: string; // TeamMember.id
  notes: string;
  /**
   * Legacy combined manual metrics (all platforms together). Kept for content
   * whose numbers were entered before per-platform metrics existed.
   */
  metrics: ContentMetrics;
  /** Per-platform metrics (manual or synced). */
  platformMetrics: PlatformMetrics;
  /** Manual ordering inside the spreadsheet (used when sort = manual). */
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type IdeaPriority = 'Low' | 'Medium' | 'High';

export interface Idea {
  id: string;
  idea: string;
  contentPillar: string;
  contentType: string;
  description: string;
  hook: string;
  reference: string;
  trend: string;
  priority: IdeaPriority;
  status: string;
  /** Set when the idea has been promoted into the Content Plan. */
  movedToContentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pillar {
  id: string;
  name: string;
  color: string; // hex, from the validated categorical palette
  description: string; // purpose
  objective: string;
  kpis: string[];
  examples: string[];
  recommendedPct: number;
}

export type StatusStage = 'idea' | 'progress' | 'scheduled' | 'published';

export type Tone =
  | 'gray'
  | 'purple'
  | 'orange'
  | 'yellow'
  | 'blue'
  | 'cyan'
  | 'indigo'
  | 'green'
  | 'pink'
  | 'red'
  | 'teal'
  | 'lime';

export interface StatusOption {
  name: string;
  tone: Tone;
  stage: StatusStage;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface BrandProfile {
  name: string;
  tagline: string;
  audience: string;
  personality: string[];
  toneDo: string[];
  toneDont: string[];
}

export interface WorkspaceSettings {
  platforms: string[];
  contentTypes: string[];
  statuses: StatusOption[];
  objectives: string[];
  ideaStatuses: string[];
  team: TeamMember[];
  brand: BrandProfile;
}

export interface WorkspaceSnapshot {
  version: number;
  contents: ContentItem[];
  ideas: Idea[];
  pillars: Pillar[];
  settings: WorkspaceSettings;
  /** Optional in backups made before insights existed. */
  accountSnapshots?: AccountSnapshot[];
  platformPosts?: PlatformPost[];
}

/* ---------- Social insights ---------- */

export type DataSource = 'api' | 'mock';

/** One platform, one day of account-level numbers. id = `${platform}:${date}`. */
export interface AccountSnapshot {
  id: string;
  platform: SocialPlatform;
  date: ISODate;
  followers?: number;
  /** True when followers was rebuilt from net follower changes, not read from the API. */
  followersEstimated?: boolean;
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
  source: DataSource;
  syncedAt: string;
}

/** A post/video synced from a platform. id = `${platform}:${mediaId}`. */
export interface PlatformPost {
  id: string;
  platform: SocialPlatform;
  mediaId: string;
  permalink: string;
  type: PostType;
  publishedAt: string;
  caption: string;
  thumbnail: string;
  metrics: PostMetrics;
  linkedContentId?: string;
  /** How the link was made. 'none' = the team explicitly unlinked it. */
  linkMethod?: 'permalink' | 'similarity' | 'manual' | 'none';
  /** Demo posts only: stand-in pillar/format so charts work before linking. */
  demoPillar?: string;
  demoFormat?: string;
  source: DataSource;
  syncedAt: string;
}

export interface SyncMeta {
  lastSyncAt: Partial<Record<SocialPlatform, string>>;
  /** Last error per platform (cleared on success). */
  lastError: Partial<Record<SocialPlatform, string>>;
}

/* ---------- UI-level types ---------- */

export type SortKey = 'publishDate' | 'status' | 'contentPillar' | 'contentType' | 'title' | 'manual';
export type SortDir = 'asc' | 'desc';

export interface ContentFilters {
  search: string;
  platforms: string[];
  pillars: string[];
  types: string[];
  statuses: string[];
  owners: string[];
}

export type PlanView = 'table' | 'calendar' | 'kanban';

export type ColumnKey =
  | 'no'
  | 'publishDate'
  | 'contentType'
  | 'contentPillar'
  | 'title'
  | 'brief'
  | 'caption'
  | 'reference'
  | 'cover'
  | 'contentUrl'
  | 'status'
  | 'platform'
  | 'owner'
  | 'cta'
  | 'objective'
  | 'kpi'
  | 'notes';

export type InsightsPeriodKind = '7d' | '28d' | '90d' | 'month' | 'all' | 'custom';
export type PlatformFilter = 'all' | SocialPlatform;

export type RouteKey = 'dashboard' | 'strategy' | 'plan' | 'calendar' | 'bank' | 'performance' | 'settings';
