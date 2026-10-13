import { localStorageAdapter } from './adapters/localStorageAdapter';
import { detectSharedWorkspace, sharedAdapter } from './adapters/sharedAdapter';
import type { DataAdapter } from './adapters/types';
import { createSeedSnapshot, EMPTY_METRICS, SCHEMA_VERSION } from './seed';
import type { ContentItem, Idea, SocialPlatform, WorkspaceSnapshot } from '@/types';
import { SOCIAL_PLATFORMS } from '@shared/insights';
import { isEmptyMetrics, legacyToPostMetrics } from '@/lib/analytics';

/**
 * Single place that decides which backend is active: the shared workspace
 * when the site has one (hosted on Vercel with Upstash, or the local server
 * forwarding to it), else this browser's localStorage.
 */
let active: DataAdapter = localStorageAdapter;
export const db: DataAdapter = new Proxy({} as DataAdapter, { get: (_, key) => active[key as keyof DataAdapter] });

/** Pick the backend; call once before loading the workspace. */
export async function initDataBackend(): Promise<void> {
  if (await detectSharedWorkspace()) active = sharedAdapter;
}

/** Fill in fields that may be missing from older/partial records. */
export function normaliseContent(c: Partial<ContentItem> & { id: string }): ContentItem {
  return {
    publishDate: '',
    platform: [],
    contentType: '',
    contentPillar: '',
    title: '',
    brief: '',
    hook: '',
    script: '',
    caption: '',
    cta: '',
    references: [],
    coverImage: '',
    contentUrl: '',
    status: 'Ideation',
    objective: '',
    kpi: '',
    owner: '',
    notes: '',
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...c,
    metrics: { ...EMPTY_METRICS, ...(c.metrics ?? {}) },
    platformMetrics: { ...(c.platformMetrics ?? {}) },
  };
}

export function normaliseIdea(i: Partial<Idea> & { id: string }): Idea {
  return {
    idea: '',
    contentPillar: '',
    contentType: '',
    description: '',
    hook: '',
    reference: '',
    trend: '',
    priority: 'Medium',
    status: 'New',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...i,
  };
}

/**
 * v3: metrics are stored per platform. Legacy combined numbers on content
 * published to exactly one social platform move to that platform (as manual
 * input). Content on several platforms keeps them as "combined" — nothing is
 * split by guesswork and nothing is dropped.
 */
export function migrateMetricsV3(c: ContentItem): ContentItem {
  if (Object.keys(c.platformMetrics).length) return c;
  const legacy = legacyToPostMetrics(c.metrics);
  const social = c.platform.filter((p): p is SocialPlatform => (SOCIAL_PLATFORMS as string[]).includes(p));
  if (isEmptyMetrics(legacy) || social.length !== 1) return c;
  return {
    ...c,
    platformMetrics: { [social[0]]: { values: legacy, source: 'manual' } },
    metrics: { ...EMPTY_METRICS },
  };
}

/**
 * v4: the October plan follows the latest Google Sheet (three posts swapped
 * dates, "Alasan Main Tennis" is posted) and the published status is called
 * "Posted" like in the sheet. Matches posts by title and only touches the
 * sheet's columns, so captions, notes, covers and metrics stay as they are.
 */
export function syncPlanV4(s: WorkspaceSnapshot): WorkspaceSnapshot {
  const rename = (status: string) => (status === 'Uploaded' ? 'Posted' : status);
  const statuses = s.settings.statuses.map((x) => (x.name === 'Uploaded' && !s.settings.statuses.some((y) => y.name === 'Posted') ? { ...x, name: 'Posted' } : x));
  const renamed = statuses.some((x, i) => x !== s.settings.statuses[i]);
  const hasPosted = statuses.some((x) => x.name === 'Posted');
  const sheet = createSeedSnapshot().contents;
  const key = (t: string) => t.trim().toLowerCase();
  const byTitle = new Map(sheet.map((c) => [key(c.title), c]));
  const seen = new Set<string>();
  const contents = s.contents.map((c) => {
    const row = byTitle.get(key(c.title));
    const status = renamed ? rename(c.status) : c.status;
    if (!row) return status === c.status ? c : { ...c, status };
    seen.add(key(c.title));
    return {
      ...c,
      publishDate: row.publishDate,
      contentType: row.contentType,
      contentPillar: row.contentPillar,
      order: row.order,
      references: c.references.length ? c.references : row.references,
      status: row.status === 'Posted' && hasPosted ? 'Posted' : status,
      updatedAt: new Date().toISOString(),
    };
  });
  const maxOrder = contents.reduce((m, c) => Math.max(m, c.order), 0);
  const added = sheet.filter((c) => !seen.has(key(c.title)) && !contents.some((x) => x.id === c.id)).map((c, i) => ({ ...c, order: maxOrder + i + 1 }));
  return { ...s, contents: [...contents, ...added], settings: renamed ? { ...s.settings, statuses } : s.settings };
}

/** Load the workspace, seeding it with sample data on first run. */
export async function loadWorkspace(): Promise<WorkspaceSnapshot> {
  let existing = await db.loadSnapshot();
  if (existing && existing.version < SCHEMA_VERSION) {
    let next: WorkspaceSnapshot = { ...existing, contents: existing.contents.map(normaliseContent), ideas: existing.ideas.map(normaliseIdea) };
    if (existing.version < 2) {
      // v2: seeded content now mirrors the source sheet. Swap old seed rows for
      // the new ones and sync pillar mix, keeping anything the user created.
      const seed = createSeedSnapshot();
      next = {
        ...next,
        contents: [...seed.contents, ...next.contents.filter((c) => !c.id.startsWith('c_seed_'))],
        pillars: next.pillars.map((p) => {
          const fresh = seed.pillars.find((x) => x.id === p.id);
          return fresh ? { ...p, recommendedPct: fresh.recommendedPct } : p;
        }),
      };
    }
    if (existing.version < 3) next = { ...next, contents: next.contents.map(migrateMetricsV3) };
    if (existing.version < 4) next = syncPlanV4(next);
    next = { ...next, version: SCHEMA_VERSION };
    await db.saveSnapshot(next);
    existing = next;
  }
  if (existing) {
    return {
      ...existing,
      contents: existing.contents.map(normaliseContent),
      ideas: existing.ideas.map(normaliseIdea),
    };
  }
  const seed = createSeedSnapshot();
  await db.saveSnapshot(seed);
  return seed;
}
