import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostInput, SocialPlatform } from '../../shared/insights.ts';

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
