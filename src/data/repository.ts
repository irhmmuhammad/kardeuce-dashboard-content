import { localStorageAdapter } from './adapters/localStorageAdapter';
import type { DataAdapter } from './adapters/types';
import { createSeedSnapshot, EMPTY_METRICS, SCHEMA_VERSION } from './seed';
import type { ContentItem, Idea, SocialPlatform, WorkspaceSnapshot } from '@/types';
import { SOCIAL_PLATFORMS } from '@shared/insights';
import { isEmptyMetrics, legacyToPostMetrics } from '@/lib/analytics';

/**
 * Single place that decides which backend is active.
 * Swap `localStorageAdapter` for a Supabase/Firebase adapter later.
 */
export const db: DataAdapter = localStorageAdapter;

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
