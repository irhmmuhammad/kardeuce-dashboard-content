import { create } from 'zustand';
import type { ContentItem, Idea, Pillar, WorkspaceSettings, WorkspaceSnapshot } from '@/types';
import { db, loadWorkspace, migrateMetricsV3, normaliseContent, normaliseIdea } from '@/data/repository';
import { createSeedSnapshot, EMPTY_METRICS, SCHEMA_VERSION } from '@/data/seed';
import { PILLAR_PALETTE } from '@/config/theme';
import { uid } from '@/lib/utils';
import { toast } from './toast';

type OptionKind = 'platform' | 'contentType' | 'status' | 'pillar' | 'objective' | 'ideaStatus' | 'owner';

interface WorkspaceState {
  status: 'loading' | 'ready';
  contents: ContentItem[];
  ideas: Idea[];
  pillars: Pillar[];
  settings: WorkspaceSettings;
  lastSavedAt: number | null;

  hydrate: () => Promise<void>;

  addContent: (input: Partial<ContentItem>) => ContentItem;
  updateContent: (id: string, patch: Partial<ContentItem>) => void;
  updateContents: (ids: string[], patch: Partial<ContentItem>) => void;
  deleteContents: (ids: string[]) => ContentItem[];
  restoreContents: (items: ContentItem[]) => void;
  duplicateContent: (id: string) => ContentItem | null;
  reorderContents: (orderedIds: string[]) => void;
  importContents: (items: Partial<ContentItem>[]) => number;

  addIdea: (input: Partial<Idea>) => Idea;
  updateIdea: (id: string, patch: Partial<Idea>) => void;
  deleteIdeas: (ids: string[]) => Idea[];
  restoreIdeas: (items: Idea[]) => void;
  moveIdeaToPlan: (id: string, plan: Partial<ContentItem>) => ContentItem | null;

  addPillar: () => Pillar;
  updatePillar: (id: string, patch: Partial<Pillar>) => void;
  deletePillar: (id: string) => void;

  updateSettings: (patch: Partial<WorkspaceSettings>) => void;
  renameOption: (kind: OptionKind, from: string, to: string) => void;

  replaceWorkspace: (snapshot: WorkspaceSnapshot) => void;
  resetWorkspace: () => void;
  exportSnapshot: () => WorkspaceSnapshot;
}

const nowISO = () => new Date().toISOString();

/** Fire-and-forget persistence with user-visible error handling. */
function persist(task: () => Promise<void>) {
  task()
    .then(() => useWorkspace.setState({ lastSavedAt: Date.now() }))
    .catch((err: unknown) => {
      console.error(err);
      toast.error('Could not save changes', err instanceof Error ? err.message : undefined);
    });
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  status: 'loading',
  contents: [],
  ideas: [],
  pillars: [],
  settings: createSeedSnapshot().settings,
  lastSavedAt: null,

  async hydrate() {
    const started = performance.now();
    const snapshot = await loadWorkspace();
    // Keep the skeleton visible for a beat so the UI doesn't flash.
    const elapsed = performance.now() - started;
    if (elapsed < 350) await new Promise((r) => setTimeout(r, 350 - elapsed));
    set({
      status: 'ready',
      contents: snapshot.contents,
      ideas: snapshot.ideas,
      pillars: snapshot.pillars,
      settings: snapshot.settings,
      lastSavedAt: Date.now(),
    });
  },

  /* ---------------- Content ---------------- */

  addContent(input) {
    const { contents, pillars } = get();
    const pillar = pillars.find((p) => p.name === input.contentPillar);
    const maxOrder = contents.reduce((m, c) => Math.max(m, c.order), 0);
    const item = normaliseContent({
      kpi: pillar?.kpis.join(', ') ?? '',
      ...input,
      id: uid('c'),
      order: maxOrder + 1,
      metrics: { ...EMPTY_METRICS, ...(input.metrics ?? {}) },
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
    set({ contents: [...contents, item] });
    persist(() => db.contents.upsert(item));
    return item;
  },

  updateContent(id, patch) {
    let updated: ContentItem | undefined;
    set((s) => ({
      contents: s.contents.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, ...patch, updatedAt: nowISO() };
        return updated;
      }),
    }));
    if (updated) {
      const item = updated;
      persist(() => db.contents.upsert(item));
    }
  },

  updateContents(ids, patch) {
    const set_ = new Set(ids);
    const changed: ContentItem[] = [];
    set((s) => ({
      contents: s.contents.map((c) => {
        if (!set_.has(c.id)) return c;
        const next = { ...c, ...patch, updatedAt: nowISO() };
        changed.push(next);
        return next;
      }),
    }));
    persist(() => db.contents.upsert(changed));
  },

  deleteContents(ids) {
    const set_ = new Set(ids);
    const removed = get().contents.filter((c) => set_.has(c.id));
    set((s) => ({
      contents: s.contents.filter((c) => !set_.has(c.id)),
      // Ideas that pointed at deleted content become available again.
      ideas: s.ideas.map((i) => (i.movedToContentId && set_.has(i.movedToContentId) ? { ...i, movedToContentId: undefined } : i)),
    }));
    persist(() => db.contents.remove(ids));
    return removed;
  },

  restoreContents(items) {
    set((s) => ({ contents: [...s.contents.filter((c) => !items.some((i) => i.id === c.id)), ...items] }));
    persist(() => db.contents.upsert(items));
  },

  duplicateContent(id) {
    const original = get().contents.find((c) => c.id === id);
    if (!original) return null;
    const { id: _omit, ...rest } = original;
    void _omit;
    return get().addContent({
      ...rest,
      title: `${original.title} (copy)`,
      status: get().settings.statuses[0]?.name ?? 'Ideation',
      contentUrl: '',
      metrics: { ...EMPTY_METRICS },
      platformMetrics: {},
      references: [...original.references],
      platform: [...original.platform],
    });
  },

  reorderContents(orderedIds) {
    const pos = new Map(orderedIds.map((id, i) => [id, i + 1]));
    const changed: ContentItem[] = [];
    set((s) => ({
      contents: s.contents.map((c) => {
        const p = pos.get(c.id);
        if (p === undefined || p === c.order) return c;
        const next = { ...c, order: p };
        changed.push(next);
        return next;
      }),
    }));
    if (changed.length) persist(() => db.contents.upsert(changed));
  },

  importContents(items) {
    const base = get().contents.reduce((m, c) => Math.max(m, c.order), 0);
    const created = items.map((input, i) =>
      migrateMetricsV3(normaliseContent({ ...input, id: uid('c'), order: base + i + 1, createdAt: nowISO(), updatedAt: nowISO() })),
    );
    set((s) => ({ contents: [...s.contents, ...created] }));
    persist(() => db.contents.upsert(created));
    return created.length;
  },

  /* ---------------- Ideas ---------------- */

  addIdea(input) {
    const item = normaliseIdea({ ...input, id: uid('i'), createdAt: nowISO(), updatedAt: nowISO() });
    set((s) => ({ ideas: [item, ...s.ideas] }));
    persist(() => db.ideas.upsert(item));
    return item;
  },

  updateIdea(id, patch) {
    let updated: Idea | undefined;
    set((s) => ({
      ideas: s.ideas.map((i) => {
        if (i.id !== id) return i;
        updated = { ...i, ...patch, updatedAt: nowISO() };
        return updated;
      }),
    }));
    if (updated) {
      const item = updated;
      persist(() => db.ideas.upsert(item));
    }
  },

  deleteIdeas(ids) {
    const set_ = new Set(ids);
    const removed = get().ideas.filter((i) => set_.has(i.id));
    set((s) => ({ ideas: s.ideas.filter((i) => !set_.has(i.id)) }));
    persist(() => db.ideas.remove(ids));
    return removed;
  },

  restoreIdeas(items) {
    set((s) => ({ ideas: [...items, ...s.ideas.filter((i) => !items.some((x) => x.id === i.id))] }));
    persist(() => db.ideas.upsert(items));
  },

  moveIdeaToPlan(id, plan) {
    const idea = get().ideas.find((i) => i.id === id);
    if (!idea) return null;
    const content = get().addContent({
      title: idea.idea,
      contentPillar: idea.contentPillar,
      contentType: idea.contentType,
      brief: idea.description,
      hook: idea.hook,
      references: idea.reference ? [idea.reference] : [],
      notes: idea.trend ? `Trend: ${idea.trend}` : '',
      ...plan,
    });
    const movedStatus = get().settings.ideaStatuses.at(-1) ?? 'Moved to Plan';
    get().updateIdea(id, { movedToContentId: content.id, status: movedStatus });
    return content;
  },

  /* ---------------- Pillars ---------------- */

  addPillar() {
    const { pillars } = get();
    const used = new Set(pillars.map((p) => p.color));
    const color = PILLAR_PALETTE.find((c) => !used.has(c)) ?? PILLAR_PALETTE[pillars.length % PILLAR_PALETTE.length];
    const pillar: Pillar = {
      id: uid('p'),
      name: `New Pillar ${pillars.length + 1}`,
      color,
      description: '',
      objective: '',
      kpis: [],
      examples: [],
      recommendedPct: 0,
    };
    set({ pillars: [...pillars, pillar] });
    persist(() => db.pillars.upsert(pillar));
    return pillar;
  },

  updatePillar(id, patch) {
    const before = get().pillars.find((p) => p.id === id);
    if (!before) return;
    if (patch.name && patch.name !== before.name) {
      get().renameOption('pillar', before.name, patch.name);
    }
    const next = { ...before, ...patch };
    set((s) => ({ pillars: s.pillars.map((p) => (p.id === id ? next : p)) }));
    persist(() => db.pillars.upsert(next));
  },

  deletePillar(id) {
    set((s) => ({ pillars: s.pillars.filter((p) => p.id !== id) }));
    persist(() => db.pillars.remove(id));
  },

  /* ---------------- Settings ---------------- */

  updateSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    persist(() => db.saveSettings(next));
  },

  /** Rename an option everywhere it is referenced (content, ideas, settings). */
  renameOption(kind, from, to) {
    if (!to || from === to) return;
    const { contents, ideas, settings } = get();
    const touchedContents: ContentItem[] = [];
    const touchedIdeas: Idea[] = [];

    const nextContents = contents.map((c) => {
      let next = c;
      if (kind === 'platform' && c.platform.includes(from)) next = { ...c, platform: c.platform.map((p) => (p === from ? to : p)) };
      if (kind === 'contentType' && c.contentType === from) next = { ...c, contentType: to };
      if (kind === 'status' && c.status === from) next = { ...c, status: to };
      if (kind === 'pillar' && c.contentPillar === from) next = { ...c, contentPillar: to };
      if (kind === 'objective' && c.objective === from) next = { ...c, objective: to };
      if (next !== c) touchedContents.push(next);
      return next;
    });
    const nextIdeas = ideas.map((i) => {
      let next = i;
      if (kind === 'contentType' && i.contentType === from) next = { ...i, contentType: to };
      if (kind === 'pillar' && i.contentPillar === from) next = { ...i, contentPillar: to };
      if (kind === 'ideaStatus' && i.status === from) next = { ...i, status: to };
      if (next !== i) touchedIdeas.push(next);
      return next;
    });

    const s = { ...settings };
    if (kind === 'platform') s.platforms = s.platforms.map((p) => (p === from ? to : p));
    if (kind === 'contentType') s.contentTypes = s.contentTypes.map((p) => (p === from ? to : p));
    if (kind === 'status') s.statuses = s.statuses.map((p) => (p.name === from ? { ...p, name: to } : p));
    if (kind === 'objective') s.objectives = s.objectives.map((p) => (p === from ? to : p));
    if (kind === 'ideaStatus') s.ideaStatuses = s.ideaStatuses.map((p) => (p === from ? to : p));

    set({ contents: nextContents, ideas: nextIdeas, settings: s });
    persist(async () => {
      if (touchedContents.length) await db.contents.upsert(touchedContents);
      if (touchedIdeas.length) await db.ideas.upsert(touchedIdeas);
      await db.saveSettings(s);
    });
  },

  /* ---------------- Workspace ---------------- */

  replaceWorkspace(snapshot) {
    const next = {
      // Backups from older versions get the same per-platform metrics migration.
      contents: snapshot.contents.map(normaliseContent).map(migrateMetricsV3),
      ideas: snapshot.ideas.map(normaliseIdea),
      pillars: snapshot.pillars,
      settings: snapshot.settings,
    };
    set(next);
    persist(() => db.saveSnapshot({ version: SCHEMA_VERSION, ...next }));
  },

  resetWorkspace() {
    get().replaceWorkspace(createSeedSnapshot());
  },

  exportSnapshot() {
    const { contents, ideas, pillars, settings } = get();
    return { version: SCHEMA_VERSION, contents, ideas, pillars, settings };
  },
}));

/* ---------------- Selectors / helpers ---------------- */

export function useStatusMap() {
  const statuses = useWorkspace((s) => s.settings.statuses);
  return statuses;
}

export function usePillarByName() {
  const pillars = useWorkspace((s) => s.pillars);
  return (name: string) => pillars.find((p) => p.name === name);
}

export function useTeamMember() {
  const team = useWorkspace((s) => s.settings.team);
  return (id: string) => team.find((t) => t.id === id);
}
