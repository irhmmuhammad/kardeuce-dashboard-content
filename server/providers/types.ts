import type {
  AccountInsightsResponse,
  DateRange,
  IntegrationMode,
  MediaInsightsResponse,
  MediaListResponse,
  PostType,
} from '../../shared/insights.ts';
import type { StoredToken } from '../tokenStore.ts';

export interface MediaRef {
  mediaId: string;
  type: PostType;
}

/** One implementation per API (Instagram Login, TikTok Business, TikTok Display). */
export interface ServerProvider {
  mode: IntegrationMode;
  label: string;
  /** App credentials present in .env. */
  configured(): boolean;
  /** Extra requirement for OAuth beyond credentials (e.g. TikTok auth URL). */
  oauthReady(): boolean;
  redirectUri(): string | null;
  authorizeUrl(state: string): string;
  exchangeCode(params: URLSearchParams): Promise<StoredToken>;
  fromPastedToken(accessToken: string, refreshToken?: string, openId?: string): Promise<StoredToken>;
  /** Refresh when needed; returns the token to use (possibly updated + saved). */
  ensureFresh(token: StoredToken): Promise<StoredToken>;
  revoke?(token: StoredToken): Promise<void>;
  account(token: StoredToken, range: DateRange): Promise<AccountInsightsResponse>;
  media(token: StoredToken, range: DateRange): Promise<MediaListResponse>;
  mediaInsights(token: StoredToken, posts: MediaRef[]): Promise<MediaInsightsResponse>;
}

export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

/** Public https base used to build OAuth redirect URIs (no trailing slash). */
export function publicUrl(): string | undefined {
  return env('PUBLIC_URL')?.replace(/\/+$/, '');
}

export function expiresIn(seconds: unknown): string | undefined {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(Date.now() + n * 1000).toISOString() : undefined;
}

/** Defined-number helper: keeps undefined/null/NaN as undefined, never 0. */
export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
