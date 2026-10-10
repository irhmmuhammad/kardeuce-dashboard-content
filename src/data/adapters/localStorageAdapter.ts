import type { AccountSnapshot, ContentItem, Idea, Pillar, PlatformPost, SyncMeta, WorkspaceSettings, WorkspaceSnapshot } from '@/types';
import { SCHEMA_VERSION } from '../seed';
import { StorageQuotaError, type Collection, type DataAdapter } from './types';

const PREFIX = 'kardeuce:v1';
const KEYS = {
  meta: `${PREFIX}:meta`,
  contents: `${PREFIX}:contents`,
  ideas: `${PREFIX}:ideas`,
  pillars: `${PREFIX}:pillars`,
  settings: `${PREFIX}:settings`,
  accountSnapshots: `${PREFIX}:accountSnapshots`,
  platformPosts: `${PREFIX}:platformPosts`,
  syncMeta: `${PREFIX}:syncMeta`,
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      throw new StorageQuotaError();
    }
    throw err;
  }
}

function collection<T extends { id: string }>(key: string): Collection<T> {
  return {
    async list() {
      return read<T[]>(key) ?? [];
    },
    async upsert(items) {
      const list = read<T[]>(key) ?? [];
      const incoming = Array.isArray(items) ? items : [items];
      const byId = new Map(list.map((x) => [x.id, x]));
      for (const item of incoming) byId.set(item.id, item);
      write(key, Array.from(byId.values()));
    },
    async remove(ids) {
      const set = new Set(Array.isArray(ids) ? ids : [ids]);
      const list = read<T[]>(key) ?? [];
      write(
        key,
        list.filter((x) => !set.has(x.id)),
      );
    },
    async replaceAll(items) {
      write(key, items);
    },
  };
}

export const localStorageAdapter: DataAdapter = {
  name: 'localStorage',

  async loadSnapshot() {
    const meta = read<{ version: number }>(KEYS.meta);
    if (!meta) return null;
    const snapshot: WorkspaceSnapshot = {
      version: meta.version,
      contents: read<ContentItem[]>(KEYS.contents) ?? [],
      ideas: read<Idea[]>(KEYS.ideas) ?? [],
      pillars: read<Pillar[]>(KEYS.pillars) ?? [],
      settings: read<WorkspaceSettings>(KEYS.settings) as WorkspaceSettings,
    };
    return snapshot.settings ? snapshot : null;
  },

  async saveSnapshot(snapshot) {
    write(KEYS.contents, snapshot.contents);
    write(KEYS.ideas, snapshot.ideas);
    write(KEYS.pillars, snapshot.pillars);
    write(KEYS.settings, snapshot.settings);
    write(KEYS.meta, { version: SCHEMA_VERSION, savedAt: new Date().toISOString() });
  },

  contents: collection<ContentItem>(KEYS.contents),
  ideas: collection<Idea>(KEYS.ideas),
  pillars: collection<Pillar>(KEYS.pillars),

  async saveSettings(settings) {
    write(KEYS.settings, settings);
  },

  accountSnapshots: collection<AccountSnapshot>(KEYS.accountSnapshots),
  platformPosts: collection<PlatformPost>(KEYS.platformPosts),

  async loadSyncMeta() {
    return read<SyncMeta>(KEYS.syncMeta);
  },

  async saveSyncMeta(meta) {
    write(KEYS.syncMeta, meta);
  },

  async clear() {
    Object.values(KEYS).forEach((k) => window.localStorage.removeItem(k));
  },
};
