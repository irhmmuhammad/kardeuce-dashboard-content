/**
 * Per-platform request queues. Calls for one platform run one at a time with a
 * minimum gap, which keeps us well inside the documented limits:
 *  - Instagram: Business Use Case limit (4800 × impressions / 24h). We also
 *    read the usage headers and slow down when any bucket passes 80%.
 *  - TikTok API for Business: 40 QPM per account per endpoint → 1.6s gap.
 *  - TikTok Display API: 600 QPM per endpoint → 150ms gap is plenty.
 */

export type QueueKey = 'instagram' | 'tiktok_business' | 'tiktok_display';

const MIN_GAP_MS: Record<QueueKey, number> = {
  instagram: 250,
  tiktok_business: 1600,
  tiktok_display: 150,
};

interface QueueState {
  tail: Promise<unknown>;
  lastStart: number;
  /** Extra delay before the next call (usage backoff), ms. */
  backoff: number;
}

const queues = new Map<QueueKey, QueueState>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function schedule<T>(key: QueueKey, task: () => Promise<T>): Promise<T> {
  const q = queues.get(key) ?? { tail: Promise.resolve(), lastStart: 0, backoff: 0 };
  queues.set(key, q);
  const run = async () => {
    const wait = q.lastStart + MIN_GAP_MS[key] + q.backoff - Date.now();
    if (wait > 0) await sleep(wait);
    q.backoff = 0;
    q.lastStart = Date.now();
    return task();
  };
  const result = q.tail.then(run, run);
  // Keep the chain alive even when a task fails.
  q.tail = result.catch(() => undefined);
  return result;
}

/**
 * Meta usage headers look like:
 *   x-app-usage: {"call_count":12,"total_time":3,"total_cputime":2}
 *   x-business-use-case-usage: {"<id>":[{"type":"instagram","call_count":85,...,"estimated_time_to_regain_access":0}]}
 * Returns the highest percentage found (0–100).
 */
export function metaUsagePct(headers: Headers): number {
  let max = 0;
  const scan = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'number' && /count|time|cputime/.test(k)) max = Math.max(max, v);
      else if (typeof v === 'object') scan(v);
    }
  };
  for (const name of ['x-business-use-case-usage', 'x-app-usage', 'x-ad-account-usage']) {
    const raw = headers.get(name);
    if (!raw) continue;
    try {
      scan(JSON.parse(raw));
    } catch {
      /* ignore malformed header */
    }
  }
  return max;
}

/** Slow the Instagram queue down as usage climbs past 80%. */
export function noteMetaUsage(headers: Headers) {
  const pct = metaUsagePct(headers);
  if (pct < 80) return;
  const q = queues.get('instagram');
  if (!q) return;
  // 80% → 2s, 90% → 7s, 100% → 12s between calls.
  q.backoff = Math.round(2000 + (pct - 80) * 500);
}

/** Meta error codes that mean "throttled". */
export const META_RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80002]);
