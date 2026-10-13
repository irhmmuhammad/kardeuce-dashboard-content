import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCIAL_PLATFORMS, type IntegrationMode } from '../shared/insights.ts';
import { PUBLISHED_DATA_FILE, type PublishedData } from '../shared/scrape.ts';
import { readScrape } from './browser/cache.ts';
import { tokenStore } from './tokenStore.ts';
import { env } from './providers/types.ts';

/**
 * Publishes the latest browser scrapes to the hosted dashboard (e.g. Vercel):
 * commits public/live-data.json straight onto origin/main and pushes, which
 * triggers a redeploy. Runs after every successful scrape when
 * PUBLISH_LIVE_DATA=1 is set in .env.
 *
 * The commit is built with git plumbing in a temporary index, so the working
 * tree, the local index and the checked-out branch are never touched.
 *
 * Published: follower counts, daily account numbers and posts (caption,
 * thumbnail, metrics). Never: tokens, cookies, Chrome profiles, scrape warnings.
 *
 *   npm run publish:data   → publish now (ignores PUBLISH_LIVE_DATA)
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_PATH = `public/${PUBLISHED_DATA_FILE}`;
const BROWSER_MODES = new Set<IntegrationMode>(['meta_business_suite', 'tiktok_studio']);
/** Instagram and TikTok usually finish a few minutes apart: wait so both go out in one deploy. */
const DEBOUNCE_MS = 2 * 60_000;

function git(args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn('git', args, { cwd: ROOT, env: { ...process.env, ...opts.env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? ok(out.trim()) : fail(new Error(`git ${args[0]}: ${err.trim() || `exit ${code}`}`))));
    child.stdin.end(opts.input ?? '');
  });
}

export function buildPublishedData(): PublishedData | null {
  const data: PublishedData = { version: 1, publishedAt: new Date().toISOString(), platforms: {} };
  for (const platform of SOCIAL_PLATFORMS) {
    const token = tokenStore.get(platform);
    const scrape = readScrape(platform);
    if (!token || !BROWSER_MODES.has(token.mode) || !scrape) continue;
    data.platforms[platform] = {
      integration: {
        platform,
        configured: true,
        connected: true,
        mode: token.mode,
        accountName: token.accountName || undefined,
        connectedAt: token.connectedAt,
        oauthAvailable: false,
        browserAvailable: false,
        historySince: scrape.historySince,
        snapshotAt: scrape.scrapedAt,
      },
      scrape: { ...scrape, warnings: [] },
    };
  }
  return Object.keys(data.platforms).length ? data : null;
}

async function pushOnce(json: string, remote: string, branch: string): Promise<'pushed' | 'unchanged'> {
  await git(['fetch', '--quiet', remote, branch]);
  const parent = await git(['rev-parse', 'FETCH_HEAD']);
  const blob = await git(['hash-object', '-w', '--stdin'], { input: json });
  const dir = mkdtempSync(join(tmpdir(), 'kardeuce-publish-'));
  try {
    const indexEnv = { GIT_INDEX_FILE: join(dir, 'index') };
    await git(['read-tree', parent], { env: indexEnv });
    await git(['update-index', '--add', '--cacheinfo', `100644,${blob},${TARGET_PATH}`], { env: indexEnv });
    const tree = await git(['write-tree'], { env: indexEnv });
    if (tree === (await git(['rev-parse', `${parent}^{tree}`]))) return 'unchanged';
    const commit = await git(['commit-tree', tree, '-p', parent, '-m', 'Update live insights data']);
    await git(['push', '--quiet', remote, `${commit}:refs/heads/${branch}`]);
    return 'pushed';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Commit and push the current data now. Throws on git errors. */
export async function publishNow(): Promise<void> {
  const data = buildPublishedData();
  if (!data) {
    console.log('[publish] nothing to publish: no browser connection has synced yet.');
    return;
  }
  const remote = env('PUBLISH_REMOTE') ?? 'origin';
  const branch = env('PUBLISH_BRANCH') ?? 'main';
  const json = JSON.stringify(data);
  let result: 'pushed' | 'unchanged';
  try {
    result = await pushOnce(json, remote, branch);
  } catch (err) {
    // Someone pushed in between: rebuild on the new tip once.
    if (!/rejected|non-fast-forward|fetch first/i.test(err instanceof Error ? err.message : '')) throw err;
    result = await pushOnce(json, remote, branch);
  }
  const what = Object.keys(data.platforms).join(' + ');
  console.log(result === 'pushed' ? `[publish] pushed ${what} data to ${remote}/${branch}.` : '[publish] data unchanged, nothing pushed.');
}

let timer: NodeJS.Timeout | undefined;
/** Publishes run one at a time. */
let queue: Promise<void> = Promise.resolve();

/** Called after each scrape; publishes (debounced) when PUBLISH_LIVE_DATA=1. Never throws. */
export function publishLiveData() {
  if (!/^(1|true|yes)$/i.test(env('PUBLISH_LIVE_DATA') ?? '')) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    queue = queue.then(() => publishNow().catch((err) => console.warn('[publish] failed:', err instanceof Error ? err.message : err)));
  }, DEBOUNCE_MS);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile(join(ROOT, '.env'));
  } catch {
    /* no .env: defaults */
  }
  publishNow().catch((err) => {
    console.error('[publish] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
