/**
 * Shared workspace (content plan, content bank, pillars, settings) for the
 * hosted dashboard: a Vercel Function backed by Upstash Redis (Vercel →
 * Storage → Upstash for Redis, which sets KV_REST_API_URL / KV_REST_API_TOKEN).
 *
 *   GET  /api/workspace          → { rev, snapshot | null }
 *   GET  /api/workspace?rev=12   → { rev, unchanged: true } when nothing changed
 *   POST /api/workspace { ops }  → { rev }   (header x-edit-code when WORKSPACE_EDIT_CODE is set)
 *
 * Each collection is a hash (id → JSON) plus a sorted set that remembers the
 * order items were first added, so lists come back in the same order. `rev`
 * goes up on every write; clients poll it to pick up each other's edits.
 *
 * Self-contained on purpose: Vercel bundles this file on its own.
 */

const COLLECTIONS = ['contents', 'ideas', 'pillars'] as const;
type CollectionName = (typeof COLLECTIONS)[number];
type Item = { id: string } & Record<string, unknown>;

type Op =
  | { kind: 'upsert'; collection: CollectionName; items: Item[] }
  | { kind: 'remove'; collection: CollectionName; ids: string[] }
  | { kind: 'replaceAll'; collection: CollectionName; items: Item[] }
  | { kind: 'settings'; settings: Record<string, unknown> }
  | { kind: 'snapshot'; snapshot: { version: number; settings: Record<string, unknown> } & Record<CollectionName, Item[]> };

const KEY = {
  rev: 'ws:rev',
  version: 'ws:version',
  settings: 'ws:settings',
  items: (c: CollectionName) => `ws:${c}`,
  order: (c: CollectionName) => `ws:${c}:order`,
};

type Command = (string | number)[];

function redisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new HttpError(503, 'Shared storage is not set up: connect Upstash for Redis to this Vercel project (Storage tab), then redeploy.');
  return { url: url.replace(/\/+$/, ''), token };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Runs commands in one round trip; `atomic` wraps them in MULTI/EXEC. */
async function redis(commands: Command[], atomic = false): Promise<unknown[]> {
  const { url, token } = redisConfig();
  const res = await fetch(`${url}/${atomic ? 'multi-exec' : 'pipeline'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new HttpError(502, `Shared storage error (HTTP ${res.status}).`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const failed = out.find((r) => r.error);
  if (failed) throw new HttpError(502, `Shared storage error: ${failed.error}`);
  return out.map((r) => r.result);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function fail(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: { message: err.message } }, err.status);
  console.error('[workspace]', err);
  return json({ error: { message: 'Unexpected error in the shared workspace.' } }, 500);
}

/** Flat [field, value, field, value] (Upstash REST) → items in first-added order. */
function ordered(hash: unknown, order: unknown): Item[] {
  const flat = Array.isArray(hash) ? (hash as string[]) : [];
  const byId = new Map<string, Item>();
  for (let i = 0; i + 1 < flat.length; i += 2) byId.set(flat[i], JSON.parse(flat[i + 1]) as Item);
  const ids = Array.isArray(order) ? (order as string[]) : [];
  const out: Item[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) out.push(item);
    byId.delete(id);
  }
  return [...out, ...byId.values()];
}

export async function GET(request: Request): Promise<Response> {
  try {
    const known = new URL(request.url).searchParams.get('rev');
    if (known !== null) {
      const [rev] = await redis([['GET', KEY.rev]]);
      if (String(rev ?? 0) === known) return json({ rev: Number(rev ?? 0), unchanged: true });
    }
    const results = await redis([
      ['GET', KEY.rev],
      ['GET', KEY.version],
      ['GET', KEY.settings],
      ...COLLECTIONS.flatMap((c): Command[] => [
        ['HGETALL', KEY.items(c)],
        ['ZRANGE', KEY.order(c), 0, -1],
      ]),
    ]);
    const [rev, version, settings] = results;
    if (!settings) return json({ rev: Number(rev ?? 0), snapshot: null });
    const collections = Object.fromEntries(COLLECTIONS.map((c, i) => [c, ordered(results[3 + i * 2], results[4 + i * 2])]));
    return json({ rev: Number(rev ?? 0), snapshot: { version: Number(version ?? 0), settings: JSON.parse(String(settings)), ...collections } });
  } catch (err) {
    return fail(err);
  }
}

function isCollection(c: unknown): c is CollectionName {
  return (COLLECTIONS as readonly unknown[]).includes(c);
}

function validItems(items: unknown): Item[] {
  if (!Array.isArray(items) || items.some((x) => !x || typeof x !== 'object' || typeof (x as Item).id !== 'string')) {
    throw new HttpError(400, 'Items must be objects with a string id.');
  }
  return items as Item[];
}

/** Commands that write `items` (keeps the first-added position of existing ones). */
function upsertCommands(c: CollectionName, items: Item[], base: number): Command[] {
  if (!items.length) return [];
  return [
    ['HSET', KEY.items(c), ...items.flatMap((x) => [x.id, JSON.stringify(x)])],
    ['ZADD', KEY.order(c), 'NX', ...items.flatMap((x, i) => [base + i, x.id])],
  ];
}

function opCommands(op: Op, base: number): Command[] {
  switch (op.kind) {
    case 'upsert':
      if (!isCollection(op.collection)) break;
      return upsertCommands(op.collection, validItems(op.items), base);
    case 'remove': {
      if (!isCollection(op.collection) || !Array.isArray(op.ids)) break;
      const ids = op.ids.filter((id): id is string => typeof id === 'string');
      return ids.length
        ? [
            ['HDEL', KEY.items(op.collection), ...ids],
            ['ZREM', KEY.order(op.collection), ...ids],
          ]
        : [];
    }
    case 'replaceAll':
      if (!isCollection(op.collection)) break;
      return [['DEL', KEY.items(op.collection), KEY.order(op.collection)], ...upsertCommands(op.collection, validItems(op.items), base)];
    case 'settings':
      if (!op.settings || typeof op.settings !== 'object') break;
      return [['SET', KEY.settings, JSON.stringify(op.settings)]];
    case 'snapshot': {
      const s = op.snapshot;
      if (!s || typeof s !== 'object' || !s.settings) break;
      return [
        ['SET', KEY.version, Number(s.version) || 0],
        ['SET', KEY.settings, JSON.stringify(s.settings)],
        ...COLLECTIONS.flatMap((c): Command[] => [['DEL', KEY.items(c), KEY.order(c)], ...upsertCommands(c, validItems(s[c] ?? []), base)]),
      ];
    }
  }
  throw new HttpError(400, `Invalid operation "${(op as { kind?: unknown }).kind}".`);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const code = process.env.WORKSPACE_EDIT_CODE?.trim();
    if (code && request.headers.get('x-edit-code') !== code) {
      throw new HttpError(401, 'This dashboard needs the edit code to save changes.');
    }
    const body = (await request.json().catch(() => null)) as { ops?: unknown } | null;
    if (!body || !Array.isArray(body.ops) || !body.ops.length) throw new HttpError(400, 'Body must be { ops: [...] }.');
    // Scores only order items; ms timestamps keep later additions after earlier ones.
    const base = Date.now() * 1000;
    const commands = (body.ops as Op[]).flatMap((op, i) => opCommands(op, base + i * 10_000));
    const results = await redis([...commands, ['INCR', KEY.rev]], true);
    return json({ rev: Number(results[results.length - 1]) });
  } catch (err) {
    return fail(err);
  }
}
