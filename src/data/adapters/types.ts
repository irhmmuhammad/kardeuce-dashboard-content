import type { AccountSnapshot, ContentItem, Idea, Pillar, PlatformPost, SyncMeta, WorkspaceSettings, WorkspaceSnapshot } from '@/types';

/**
 * Persistence contract. The UI/store only ever talks to this interface, so
 * moving from localStorage to Supabase / Firebase / PostgreSQL means writing a
 * new adapter (e.g. `supabaseAdapter.ts`) that implements the same methods —
 * no component changes required.
 */
export interface Collection<T extends { id: string }> {
  list(): Promise<T[]>;
  upsert(items: T | T[]): Promise<void>;
  remove(ids: string | string[]): Promise<void>;
  replaceAll(items: T[]): Promise<void>;
}

export interface DataAdapter {
  readonly name: string;
  /** Returns null when the workspace has never been initialised. */
  loadSnapshot(): Promise<WorkspaceSnapshot | null>;
  saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
  contents: Collection<ContentItem>;
  ideas: Collection<Idea>;
  pillars: Collection<Pillar>;
  saveSettings(settings: WorkspaceSettings): Promise<void>;
  /** Daily account-level numbers per platform. */
  accountSnapshots: Collection<AccountSnapshot>;
  /** Posts/videos synced from Instagram & TikTok. */
  platformPosts: Collection<PlatformPost>;
  loadSyncMeta(): Promise<SyncMeta | null>;
  saveSyncMeta(meta: SyncMeta): Promise<void>;
  clear(): Promise<void>;
}

export class StorageQuotaError extends Error {
  constructor() {
    super('Browser storage is full. Try using smaller cover images or remove unused ones.');
    this.name = 'StorageQuotaError';
  }
}
