import { create } from 'zustand';
import { SOCIAL_PLATFORMS, type IntegrationsResponse, type IntegrationStatus, type SocialPlatform } from '@shared/insights';
import type { AccountSnapshot, PlatformMetricSet, PlatformPost, SyncMeta } from '@/types';
import { db } from '@/data/repository';
import {
  api,
  applyPostsToContents,
  autoLink,
  isStale,
  mockProvider,
  platformSlug,
  remoteProvider,
  syncedSet,
  syncPlatform,
  type MetricConflict,
  type MetricsProvider,
} from '@/services/metrics';
import { useWorkspace } from './workspace';
import { toast } from './toast';

/**
 * Social insights: account snapshots, synced posts, integration status and
 * sync orchestration. Persisted through the same adapter as the workspace.
 *
 * Data mode per platform:
 *  - 'live'  : connected on the server → real API data
 *  - 'stale' : not connected any more, but real data was synced before → shown as-is, never mixed with demo data
 *  - 'demo'  : never connected → deterministic demo data
 */
export type PlatformMode = 'live' | 'stale' | 'demo';

export interface PlatformSyncState {
  syncing: boolean;
  warnings: string[];
  errors: string[];
}

interface InsightsState {
  status: 'idle' | 'loading' | 'ready';
  snapshots: AccountSnapshot[];
  posts: PlatformPost[];
  meta: SyncMeta;
  integrations: IntegrationStatus[] | null;
  serverError: string | null;
  sync: Record<SocialPlatform, PlatformSyncState>;
  conflicts: MetricConflict[];

  hydrate: () => Promise<void>;
  refreshIntegrations: () => Promise<void>;
  syncNow: (opts?: { platforms?: SocialPlatform[]; auto?: boolean }) => Promise<void>;
  linkPost: (postId: string, contentId: string | null) => void;
  resolveConflicts: (decisions: { conflict: MetricConflict; use: 'manual' | 'synced' }[]) => void;
  pasteToken: (platform: SocialPlatform, accessToken: string, refreshToken?: string, openId?: string) => Promise<boolean>;
  disconnect: (platform: SocialPlatform) => Promise<void>;
  replaceData: (snapshots: AccountSnapshot[], posts: PlatformPost[]) => void;
}

const EMPTY_SYNC: PlatformSyncState = { syncing: false, warnings: [], errors: [] };
const EMPTY_META: SyncMeta = { lastSyncAt: {}, lastError: {} };

function persist(task: () => Promise<void>) {
  task().catch((err: unknown) => {
    console.error(err);
    toast.error('Could not save insights', err instanceof Error ? err.message : undefined);
  });
}

export function platformMode(platform: SocialPlatform, s: Pick<InsightsState, 'integrations' | 'posts' | 'snapshots'>): PlatformMode {
  const integ = s.integrations?.find((i) => i.platform === platform);
  if (integ?.connected) return 'live';
  const hasReal = s.posts.some((p) => p.platform === platform && p.source === 'api') || s.snapshots.some((x) => x.platform === platform && x.source === 'api');
  return hasReal ? 'stale' : 'demo';
}

let hydrated = false;

export const useInsights = create<InsightsState>()((set, get) => ({
  status: 'idle',
  snapshots: [],
  posts: [],
  meta: EMPTY_META,
  integrations: null,
  serverError: null,
  sync: { Instagram: EMPTY_SYNC, TikTok: EMPTY_SYNC },
  conflicts: [],

  async hydrate() {
    if (hydrated) return;
    hydrated = true;
    set({ status: 'loading' });
    const [snapshots, posts, meta] = await Promise.all([db.accountSnapshots.list(), db.platformPosts.list(), db.loadSyncMeta()]);
    set({ snapshots, posts, meta: meta ?? EMPTY_META });
    await get().refreshIntegrations();
    set({ status: 'ready' });

    // Returning from an OAuth redirect: #/settings?connected=instagram or ?oauth_error=…
    const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const connected = query.get('connected');
    const oauthError = query.get('oauth_error');
    if (connected || oauthError) {
      window.history.replaceState(null, '', window.location.hash.split('?')[0] || '#/settings');
      if (oauthError) toast.error('Connection failed', oauthError);
      else {
        const platform = SOCIAL_PLATFORMS.find((p) => platformSlug(p) === connected);
        if (platform) {
          toast.success(`${platform} connected`, 'Pulling your insights now…');
          await get().syncNow({ platforms: [platform] });
          return;
        }
      }
    }

    // Auto-sync platforms whose last sync is older than 6h (or never synced).
    const due = SOCIAL_PLATFORMS.filter((p) => platformMode(p, get()) !== 'stale' && isStale(get().meta.lastSyncAt[p]));
    if (due.length) void get().syncNow({ platforms: due, auto: true });
  },

  async refreshIntegrations() {
    try {
      const res = await api<IntegrationsResponse>('/integrations');
      set({ integrations: res.integrations, serverError: null });
    } catch (err) {
      // No server = demo mode for everything; the app keeps working.
      set({ integrations: [], serverError: err instanceof Error ? err.message : 'API server unavailable' });
    }
  },

  async syncNow(opts = {}) {
    const state = get();
    const platforms = (opts.platforms ?? SOCIAL_PLATFORMS).filter((p) => !state.sync[p].syncing);
    if (!platforms.length) return;
    if (!opts.auto) await get().refreshIntegrations();

    const ws = useWorkspace.getState();
    const providers: MetricsProvider[] = [];
    const skipped: SocialPlatform[] = [];
    for (const p of platforms) {
      const mode = platformMode(p, get());
      if (mode === 'stale') {
        skipped.push(p);
        continue;
      }
      const integ = get().integrations?.find((i) => i.platform === p);
      providers.push(mode === 'live' && integ ? remoteProvider(integ) : mockProvider(p, ws.contents, ws.pillars.map((x) => x.name)));
    }
    if (skipped.length && !opts.auto) {
      toast.info(`${skipped.join(' & ')} not connected`, 'Showing the last synced data. Reconnect in Settings → Integrations to refresh it.');
    }
    if (!providers.length) return;

    set((s) => ({ sync: { ...s.sync, ...Object.fromEntries(providers.map((p) => [p.platform, { syncing: true, warnings: [], errors: [] }])) } }));

    // Platforms run one after another: each server provider already throttles itself.
    for (const provider of providers) {
      const platform = provider.platform;
      const live = provider.kind !== 'mock';
      const result = await syncPlatform(provider, get().snapshots, get().posts);
      const gotData = result.snapshots.length > 0 || result.posts.length > 0;

      if (gotData) {
        const prev = get();
        // First live sync replaces demo data for that platform (demo rows are never mixed with real ones).
        const keepSnap = (s: AccountSnapshot) => s.platform !== platform || (live ? s.source === 'api' : s.source === 'mock');
        const keepPost = (p: PlatformPost) => p.platform !== platform || (live ? p.source === 'api' : p.source === 'mock');
        const snapMap = new Map(prev.snapshots.filter(keepSnap).map((s) => [s.id, s]));
        result.snapshots.forEach((s) => snapMap.set(s.id, s));
        const postMap = new Map(prev.posts.filter(keepPost).map((p) => [p.id, p]));
        result.posts.forEach((p) => postMap.set(p.id, p));
        const posts = autoLink(Array.from(postMap.values()), useWorkspace.getState().contents);
        const snapshots = Array.from(snapMap.values());
        set({ snapshots, posts });
        persist(async () => {
          await db.accountSnapshots.replaceAll(snapshots);
          await db.platformPosts.replaceAll(posts);
        });
        if (live) clearDemoMetrics(platform);
        applyToContents();
      }

      const ok = result.errors.length === 0;
      const meta: SyncMeta = {
        lastSyncAt: { ...get().meta.lastSyncAt, ...(gotData ? { [platform]: new Date().toISOString() } : {}) },
        lastError: { ...get().meta.lastError, [platform]: ok ? undefined : result.errors[0] },
      };
      set((s) => ({ meta, sync: { ...s.sync, [platform]: { syncing: false, warnings: result.warnings, errors: result.errors } } }));
      persist(() => db.saveSyncMeta(meta));

      if (!opts.auto || !ok) {
        if (ok) toast.success(`${platform} synced`, `${result.posts.length} posts · ${result.snapshots.length} days${live ? '' : ' (demo data)'}`);
        else if (gotData) toast.error(`${platform} synced with problems`, result.errors[0]);
        else toast.error(`${platform} sync failed`, result.errors[0]);
      }
    }
  },

  linkPost(postId, contentId) {
    const posts = get().posts.map((p) =>
      p.id === postId ? { ...p, linkedContentId: contentId ?? undefined, linkMethod: contentId ? ('manual' as const) : ('none' as const) } : p,
    );
    set({ posts });
    const post = posts.find((p) => p.id === postId);
    if (post) persist(() => db.platformPosts.upsert(post));
    applyToContents();
  },

  resolveConflicts(decisions) {
    const ws = useWorkspace.getState();
    for (const { conflict, use } of decisions) {
      const c = ws.contents.find((x) => x.id === conflict.contentId);
      if (!c) continue;
      const cur = c.platformMetrics[conflict.platform];
      const next: PlatformMetricSet =
        use === 'synced'
          ? syncedSet(conflict.post)
          : { ...(cur ?? { values: conflict.manual, source: 'manual' }), keepManual: true, mediaId: conflict.post.mediaId, permalink: conflict.post.permalink };
      ws.updateContent(c.id, { platformMetrics: { ...c.platformMetrics, [conflict.platform]: next } });
    }
    const resolved = new Set(decisions.map((d) => `${d.conflict.contentId}:${d.conflict.platform}`));
    set((s) => ({ conflicts: s.conflicts.filter((c) => !resolved.has(`${c.contentId}:${c.platform}`)) }));
  },

  async pasteToken(platform, accessToken, refreshToken, openId) {
    try {
      await api<IntegrationStatus>(`/auth/${platformSlug(platform)}/token`, {
        method: 'POST',
        body: JSON.stringify({ accessToken: accessToken.trim(), refreshToken: refreshToken?.trim() || undefined, openId: openId?.trim() || undefined }),
      });
      await get().refreshIntegrations();
      toast.success(`${platform} connected`, 'Pulling your insights now…');
      void get().syncNow({ platforms: [platform] });
      return true;
    } catch (err) {
      toast.error('Token not accepted', err instanceof Error ? err.message : undefined);
      return false;
    }
  },

  async disconnect(platform) {
    try {
      await api(`/integrations/${platformSlug(platform)}`, { method: 'DELETE' });
      toast.success(`${platform} disconnected`, 'Synced data stays in this workspace.');
    } catch (err) {
      toast.error('Could not disconnect', err instanceof Error ? err.message : undefined);
    }
    await get().refreshIntegrations();
  },

  replaceData(snapshots, posts) {
    set({ snapshots, posts });
    persist(async () => {
      await db.accountSnapshots.replaceAll(snapshots);
      await db.platformPosts.replaceAll(posts);
    });
  },
}));

/** Remove demo numbers from content once a platform has real data. */
function clearDemoMetrics(platform: SocialPlatform) {
  const ws = useWorkspace.getState();
  for (const c of ws.contents) {
    if (c.platformMetrics[platform]?.source === 'mock') {
      const next = { ...c.platformMetrics };
      delete next[platform];
      ws.updateContent(c.id, { platformMetrics: next });
    }
  }
}

/** Push linked posts' numbers into content items; queue conflicts with manual input. */
function applyToContents() {
  const ws = useWorkspace.getState();
  const { updates, conflicts } = applyPostsToContents(useInsights.getState().posts, ws.contents);
  for (const u of updates) ws.updateContent(u.id, { platformMetrics: u.platformMetrics });
  if (conflicts.length) {
    useInsights.setState((s) => {
      const known = new Set(s.conflicts.map((c) => `${c.contentId}:${c.platform}`));
      return { conflicts: [...s.conflicts, ...conflicts.filter((c) => !known.has(`${c.contentId}:${c.platform}`))] };
    });
  }
}

/* ---------------- Selectors ---------------- */

export function usePlatformModes(): Record<SocialPlatform, PlatformMode> {
  const integrations = useInsights((s) => s.integrations);
  const posts = useInsights((s) => s.posts);
  const snapshots = useInsights((s) => s.snapshots);
  return {
    Instagram: platformMode('Instagram', { integrations, posts, snapshots }),
    TikTok: platformMode('TikTok', { integrations, posts, snapshots }),
  };
}

export function useIsSyncing(): boolean {
  return useInsights((s) => s.sync.Instagram.syncing || s.sync.TikTok.syncing);
}
