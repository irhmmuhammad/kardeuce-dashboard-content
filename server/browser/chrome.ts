import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright-core';
import type { SocialPlatform } from '../../shared/insights.ts';
import { ApiError } from '../errors.ts';
import { env } from '../providers/types.ts';

/**
 * Local Chrome automation for the no-token connections (TikTok Studio, Meta
 * Business Suite). Each platform gets its own Chrome profile under
 * server/.data/browser/<platform> (gitignored), so the login cookies live on
 * this machine only and the user's normal Chrome profile is never touched.
 *
 * This reads private web dashboards, not a public API: the pages can change
 * without notice, and automated access is against the platforms' terms. Keep
 * the sync interval long (default 6h) so the traffic looks like a person
 * checking their stats.
 */

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.data');
const PROFILE_ROOT = join(DATA_DIR, 'browser');
const DEBUG_DIR = join(DATA_DIR, 'scrape-debug');

const CHROME_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
};

export function chromePath(): string | undefined {
  const custom = env('CHROME_PATH');
  if (custom) return existsSync(custom) ? custom : undefined;
  return (CHROME_PATHS[process.platform] ?? []).find((p) => existsSync(p));
}

export const browserAvailable = () => !!chromePath();

const profileDir = (platform: SocialPlatform) => join(PROFILE_ROOT, platform.toLowerCase());

/** Logs out by deleting the Chrome profile (cookies) for that platform. */
export function clearProfile(platform: SocialPlatform): Promise<void> {
  return withProfileLock(platform, async () => rmSync(profileDir(platform), { recursive: true, force: true }));
}

/** One Chrome per profile at a time (Chrome locks its profile directory). */
const locks = new Map<SocialPlatform, Promise<unknown>>();

export function withProfileLock<T>(platform: SocialPlatform, task: () => Promise<T>): Promise<T> {
  const prev = locks.get(platform) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  locks.set(platform, next);
  return next;
}

/**
 * Headless Chrome says "HeadlessChrome/<version>" in its user agent. The
 * session was logged in from the normal window, and Instagram throttles it
 * (HTTP 429) once it shows up from a headless browser, so headless runs send
 * the regular Chrome user agent. Read once per server run from the installed Chrome.
 */
let regularUserAgent: string | undefined;

async function userAgentFor(start: (userAgent?: string) => Promise<BrowserContext>): Promise<string> {
  if (regularUserAgent) return regularUserAgent;
  const probe = await start();
  try {
    const page = probe.pages()[0] ?? (await probe.newPage());
    // Runs in the page; the server tsconfig has no DOM types.
    const ua = String(await page.evaluate('navigator.userAgent'));
    return (regularUserAgent = ua.replace('HeadlessChrome/', 'Chrome/'));
  } finally {
    await probe.close().catch(() => undefined);
  }
}

export async function launch(platform: SocialPlatform, opts: { headless: boolean }): Promise<BrowserContext> {
  const executablePath = chromePath();
  if (!executablePath) throw new ApiError('not_configured', 'Google Chrome was not found. Install Chrome, or set CHROME_PATH in .env.');
  mkdirSync(profileDir(platform), { recursive: true });
  const start = (userAgent?: string) =>
    chromium.launchPersistentContext(profileDir(platform), {
      executablePath,
      headless: opts.headless,
      viewport: opts.headless ? { width: 1366, height: 900 } : null,
      locale: 'en-US',
      userAgent,
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
  try {
    return await start(opts.headless ? await userAgentFor(start) : undefined);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    throw new ApiError('internal', `Could not start Chrome for ${platform}: ${reason}`);
  }
}

export const headless = () => env('BROWSER_HEADLESS') !== 'false';

export async function hasCookie(ctx: BrowserContext, domain: string, name: string): Promise<boolean> {
  const cookies = await ctx.cookies();
  return cookies.some((c) => c.name === name && c.domain.endsWith(domain) && !!c.value && (c.expires === -1 || c.expires * 1000 > Date.now()));
}

const execFileAsync = promisify(execFile);

/**
 * macOS: the login window is a separate Chrome app instance (own profile), so
 * it often opens behind the user's normal Chrome. Bring it to the front.
 * NSRunningApplication needs no Accessibility permission.
 */
export async function focusChrome(platform: SocialPlatform) {
  if (process.platform !== 'darwin') return;
  const { stdout } = await execFileAsync('ps', ['-ax', '-ww', '-o', 'pid=,command=']).catch(() => ({ stdout: '' }));
  const main = stdout.split('\n').find((l) => l.includes(`--user-data-dir=${profileDir(platform)}`) && !l.includes('--type='));
  const pid = Number(main?.trim().split(/\s+/)[0]);
  if (!pid) return;
  const script = `ObjC.import('Cocoa'); const a = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}); if (!a.isNil()) a.activateWithOptions(3);`;
  await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script]).catch(() => undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Open a visible Chrome window on the login pages and wait until the user is
 * logged in on the required site(s) and closes the window (or `timeoutMs`).
 */
export async function interactiveLogin(
  platform: SocialPlatform,
  urls: string[],
  isDone: (ctx: BrowserContext) => Promise<boolean>,
  timeoutMs = 10 * 60_000,
): Promise<boolean> {
  return withProfileLock(platform, async () => {
    const ctx = await launch(platform, { headless: false });
    let closed = false;
    // Cookies can't be read once the window is closed, so poll while it's open.
    let done = false;
    ctx.on('close', () => (closed = true));
    try {
      const first = ctx.pages()[0] ?? (await ctx.newPage());
      await first.goto(urls[0]).catch(() => undefined);
      for (const url of urls.slice(1)) {
        const p = await ctx.newPage();
        await p.goto(url).catch(() => undefined);
      }
      await first.bringToFront().catch(() => undefined);
      await focusChrome(platform);
      // Wait for the user to close the window: they may still be logging in
      // to the optional second site after the required one is done.
      const deadline = Date.now() + timeoutMs;
      while (!closed && Date.now() < deadline && ctx.pages().length > 0) {
        done = await isDone(ctx).catch(() => done);
        await sleep(1500);
      }
      return done;
    } finally {
      if (!closed) await ctx.close().catch(() => undefined);
    }
  });
}

/** JSON bodies the dashboards fetched while we browsed (the data we parse). */
export interface Harvest {
  url: string;
  json: unknown;
}

export async function harvestJson(page: Page, match: (url: string) => boolean, sink: Harvest[]) {
  page.on('response', async (res: Response) => {
    const url = res.url();
    if (!match(url)) return;
    const type = res.headers()['content-type'] ?? '';
    if (!type.includes('json') && !type.includes('javascript') && !type.includes('text/plain')) return;
    try {
      const text = await res.text();
      for (const json of parseJsonish(text)) sink.push({ url, json });
    } catch {
      /* body unavailable (redirect, aborted) */
    }
  });
}

/** Meta GraphQL can stream several JSON objects in one body, one per line. */
export function parseJsonish(text: string): unknown[] {
  const clean = text.replace(/^for \(;;\);/, '').trim();
  if (!clean || (clean[0] !== '{' && clean[0] !== '[')) return [];
  try {
    return [JSON.parse(clean)];
  } catch {
    const out: unknown[] = [];
    for (const line of clean.split('\n')) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* not JSON */
      }
    }
    return out;
  }
}

export async function scrollToLoad(page: Page, rounds: number, pauseMs = 1500) {
  for (let i = 0; i < rounds; i++) {
    await page.mouse.wheel(0, 2500).catch(() => undefined);
    // Runs in the page; the server tsconfig has no DOM types.
    await page.evaluate('window.scrollBy(0, document.body.scrollHeight)').catch(() => undefined);
    await sleep(pauseMs);
  }
}

export { sleep };

/** SCRAPE_DEBUG=true saves what was harvested so the parsers can be tuned. */
export function debugDump(platform: SocialPlatform, harvest: Harvest[]) {
  if (env('SCRAPE_DEBUG') !== 'true') return;
  mkdirSync(DEBUG_DIR, { recursive: true });
  const file = join(DEBUG_DIR, `${platform.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(harvest, null, 1), { mode: 0o600 });
  console.log(`[browser] ${platform}: saved ${harvest.length} responses to ${file}`);
}
