import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccountDayInput, PostInput, SocialPlatform } from '../../shared/insights.ts';
import type { ErrorCode } from '../errors.ts';

/**
 * Last scrape per platform: server/.data/scrape-<platform>.json. Follower
 * counts are kept per day so the dashboards get a history even though the web
 * pages only show today's number.
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

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.data');
const file = (p: SocialPlatform) => join(DATA_DIR, `scrape-${p.toLowerCase()}.json`);

export function readScrape(platform: SocialPlatform): ScrapeResult | undefined {
  if (!existsSync(file(platform))) return undefined;
  try {
    return JSON.parse(readFileSync(file(platform), 'utf8')) as ScrapeResult;
  } catch {
    return undefined;
  }
}

export function writeScrape(platform: SocialPlatform, result: ScrapeResult) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file(platform)}.tmp`;
  writeFileSync(tmp, JSON.stringify(result, null, 1), { mode: 0o600 });
  renameSync(tmp, file(platform));
}

/**
 * Last failed sync: server/.data/sync-failure-<platform>.json. Until `until`,
 * syncs repeat this error instead of opening Chrome again (retrying a rate
 * limit only makes it last longer). Kept on disk so a server restart doesn't
 * retry right away.
 */
export interface SyncFailure {
  until: string;
  code: ErrorCode;
  message: string;
}

const failureFile = (p: SocialPlatform) => join(DATA_DIR, `sync-failure-${p.toLowerCase()}.json`);

/** The failure while its pause is still running, else undefined. */
export function readFailure(platform: SocialPlatform): SyncFailure | undefined {
  if (!existsSync(failureFile(platform))) return undefined;
  try {
    const f = JSON.parse(readFileSync(failureFile(platform), 'utf8')) as SyncFailure;
    return Date.parse(f.until) > Date.now() ? f : undefined;
  } catch {
    return undefined;
  }
}

export function writeFailure(platform: SocialPlatform, failure: SyncFailure) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(failureFile(platform), JSON.stringify(failure, null, 1), { mode: 0o600 });
}

export function clearFailure(platform: SocialPlatform) {
  rmSync(failureFile(platform), { force: true });
}
