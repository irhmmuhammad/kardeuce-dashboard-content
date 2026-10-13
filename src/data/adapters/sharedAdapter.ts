import type { ContentItem, Idea, Pillar, WorkspaceSettings, WorkspaceSnapshot } from '@/types';
import { localStorageAdapter } from './localStorageAdapter';
import type { Collection, DataAdapter } from './types';

/**
 * Shared workspace on the hosted dashboard (api/workspace.ts, Upstash Redis):
 * content plan, content bank, pillars and settings are the same for everyone
 * with the link. Insights data stays per browser (it comes from the published
 * sync data anyway).
 */

type CollectionName = 'contents' | 'ideas' | 'pillars';
type Op =
  | { kind: 'upsert'; collection: CollectionName; items: { id: string }[] }
  | { kind: 'remove'; collection: CollectionName; ids: string[] }
  | { kind: 'replaceAll'; collection: CollectionName; items: { id: string }[] }
  | { kind: 'settings'; settings: WorkspaceSettings }
  | { kind: 'snapshot'; snapshot: WorkspaceSnapshot };

interface WorkspaceResponse {
  rev: number;
  unchanged?: boolean;
  snapshot?: WorkspaceSnapshot | null;
}

const ENDPOINT = '/api/workspace';
const CODE_KEY = 'kardeuce:editCode';

/** Last server revision this browser has fully applied; -1 forces a reload. */
let knownRev = -1;
/** Writes in flight: polls don't apply server data meanwhile (it may predate them). */
let pending = 0;
let first: WorkspaceSnapshot | null | undefined;

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !body) throw new Error(body?.error?.message ?? `Shared workspace error (HTTP ${res.status}).`);
  return body;
}

async function fetchWorkspace(rev?: number): Promise<WorkspaceResponse> {
  const res = await fetch(rev === undefined ? ENDPOINT : `${ENDPOINT}?rev=${rev}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  return readJson<WorkspaceResponse>(res);
}

/** True when this site has a working shared workspace (keeps the first load for loadSnapshot). */
export async function detectSharedWorkspace(): Promise<boolean> {
  try {
    const res = await fetchWorkspace();
    if (typeof res.rev !== 'number' || res.snapshot === undefined) return false;
    knownRev = res.rev;
    first = res.snapshot;
    return true;
  } catch {
    return false;
  }
}

function editCode(): string {
  try {
    return window.localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

async function post(ops: Op[], code: string): Promise<Response> {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(code ? { 'x-edit-code': code } : {}) },
    body: JSON.stringify({ ops }),
  });
}

async function write(ops: Op[]): Promise<void> {
  pending++;
  try {
    let res = await post(ops, editCode());
    if (res.status === 401) {
      const code = window.prompt('Enter the edit code to save changes to this dashboard:')?.trim();
      if (code) {
        res = await post(ops, code);
        if (res.ok) {
          try {
            window.localStorage.setItem(CODE_KEY, code);
          } catch {
            /* remembered for this session only */
          }
        }
      }
    }
    const { rev } = await readJson<{ rev: number }>(res);
    // Nobody else wrote in between: we're up to date. Otherwise the next poll reloads.
    if (rev === knownRev + 1) knownRev = rev;
  } catch (err) {
    knownRev = -1; // the server didn't take it: the next poll restores the server's version
    throw err;
  } finally {
    pending--;
  }
}

/** Newer server data, or null when nothing changed (or a local write is still in flight). */
export async function pollSharedWorkspace(): Promise<WorkspaceSnapshot | null> {
  if (pending) return null;
  const res = await fetchWorkspace(knownRev);
  if (res.unchanged || pending || !res.snapshot) return null;
  knownRev = res.rev;
  return res.snapshot;
}

function collection<T extends { id: string }>(name: CollectionName): Collection<T> {
  const list = (s: WorkspaceSnapshot | null) => ((s?.[name] ?? []) as unknown as T[]);
  return {
    async list() {
      return list((await fetchWorkspace()).snapshot ?? null);
    },
    upsert: (items) => write([{ kind: 'upsert', collection: name, items: Array.isArray(items) ? items : [items] }]),
    remove: (ids) => write([{ kind: 'remove', collection: name, ids: Array.isArray(ids) ? ids : [ids] }]),
    replaceAll: (items) => write([{ kind: 'replaceAll', collection: name, items }]),
  };
}

export const sharedAdapter: DataAdapter = {
  name: 'shared',

  async loadSnapshot() {
    if (first !== undefined) {
      const s = first;
      first = undefined;
      return s;
    }
    // Errors throw (never null): null would make the app re-seed over real data.
    const res = await fetchWorkspace();
    knownRev = res.rev;
    return res.snapshot ?? null;
  },

  saveSnapshot: (snapshot) => write([{ kind: 'snapshot', snapshot }]),

  contents: collection<ContentItem>('contents'),
  ideas: collection<Idea>('ideas'),
  pillars: collection<Pillar>('pillars'),

  saveSettings: (settings) => write([{ kind: 'settings', settings }]),

  accountSnapshots: localStorageAdapter.accountSnapshots,
  platformPosts: localStorageAdapter.platformPosts,
  loadSyncMeta: () => localStorageAdapter.loadSyncMeta(),
  saveSyncMeta: (meta) => localStorageAdapter.saveSyncMeta(meta),
  clear: () => localStorageAdapter.clear(),
};
