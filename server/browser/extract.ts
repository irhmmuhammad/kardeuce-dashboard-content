import type { PostMetrics } from '../../shared/insights.ts';
import { num } from '../providers/types.ts';

/**
 * Heuristic readers for the JSON the dashboards load. The private endpoints
 * and their field names change often (snake_case in one release, camelCase in
 * the next, nested under `statistics` or `stats`…), so instead of hard-coding
 * paths we walk every harvested body and pick out objects that look like a
 * post. Unknown → undefined, never 0.
 */

export function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 40 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const v of node) yield* walk(v, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  yield obj;
  for (const v of Object.values(obj)) if (v && typeof v === 'object') yield* walk(v, depth + 1);
}

/** First defined numeric value among `keys`, looking in obj and its stats-like children. */
export function pick(obj: Record<string, unknown>, keys: string[]): number | undefined {
  const scopes = [obj, ...['stats', 'statistics', 'stats_v2', 'statsV2', 'metrics', 'insights', 'item_stats'].map((k) => obj[k]).filter((v) => v && typeof v === 'object')] as Record<string, unknown>[];
  for (const scope of scopes) {
    for (const k of keys) {
      const v = scope[k];
      const n = typeof v === 'object' && v !== null && 'value' in v ? num((v as { value: unknown }).value) : num(v);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

export function str(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Larger counts are newer: dashboards and profile pages can lag each other. */
export function mergeMetrics(a: PostMetrics, b: PostMetrics): PostMetrics {
  const out: PostMetrics = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof PostMetrics, PostMetrics[keyof PostMetrics]][]) {
    if (v === undefined) continue;
    const cur = out[k];
    if (typeof v === 'number' && typeof cur === 'number') (out as Record<string, unknown>)[k] = Math.max(cur, v);
    else if (cur === undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Rates may come as 0–1 or 0–100. */
export function percent(v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  return v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
}

/** Watch time may come in ms or seconds. */
export function seconds(v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  return v > 1000 ? Math.round(v / 100) / 10 : v;
}

/** Unix seconds / ms / ISO string → ISO timestamp. */
export function toISO(v: unknown): string | undefined {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v;
  const n = num(v);
  if (n === undefined || n <= 0) return undefined;
  return new Date(n > 1e12 ? n : n * 1000).toISOString();
}
