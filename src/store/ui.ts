import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ColumnKey, ContentFilters, InsightsPeriodKind, ISODate, MonthKey, PlanView, PlatformFilter, SortDir, SortKey } from '@/types';
import { currentMonthKey } from '@/lib/date';

export const EMPTY_FILTERS: ContentFilters = {
  search: '',
  platforms: [],
  pillars: [],
  types: [],
  statuses: [],
  owners: [],
};

export const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = [
  'no',
  'publishDate',
  'contentType',
  'contentPillar',
  'title',
  'brief',
  'caption',
  'reference',
  'cover',
  'contentUrl',
  'status',
  'platform',
  'owner',
];

interface QuickAddState {
  open: boolean;
  date?: ISODate;
  status?: string;
}

interface UIState {
  /* persisted preferences */
  sidebarCollapsed: boolean;
  visibleColumns: ColumnKey[];
  planView: PlanView;
  sort: { key: SortKey; dir: SortDir };
  bankView: 'cards' | 'table';
  calendarMode: 'month' | 'week';
  freezeUntil: 'none' | 'publishDate' | 'title';
  showInsights: boolean;
  rowDensity: 'compact' | 'comfortable';
  insightsPlatform: PlatformFilter;
  insightsPeriod: InsightsPeriodKind;
  insightsCustom: { since: ISODate; until: ISODate };
  postColumns: string[];

  /* session state */
  month: MonthKey;
  weekAnchor: ISODate | null;
  filters: ContentFilters;
  openContentId: string | null;
  quickAdd: QuickAddState;
  lightbox: string | null;
  mobileNavOpen: boolean;

  setSidebarCollapsed: (v: boolean) => void;
  toggleColumn: (key: ColumnKey) => void;
  setVisibleColumns: (keys: ColumnKey[]) => void;
  setPlanView: (v: PlanView) => void;
  setSort: (key: SortKey, dir?: SortDir) => void;
  setBankView: (v: 'cards' | 'table') => void;
  setCalendarMode: (v: 'month' | 'week') => void;
  setFreezeUntil: (v: 'none' | 'publishDate' | 'title') => void;
  setShowInsights: (v: boolean) => void;
  setRowDensity: (v: 'compact' | 'comfortable') => void;
  setInsightsPlatform: (v: PlatformFilter) => void;
  setInsightsPeriod: (v: InsightsPeriodKind) => void;
  setInsightsCustom: (v: { since: ISODate; until: ISODate }) => void;
  setPostColumns: (v: string[]) => void;
  setMonth: (m: MonthKey) => void;
  setWeekAnchor: (d: ISODate | null) => void;
  setFilters: (patch: Partial<ContentFilters>) => void;
  clearFilters: () => void;
  openContent: (id: string | null) => void;
  openQuickAdd: (opts?: Omit<QuickAddState, 'open'>) => void;
  closeQuickAdd: () => void;
  openLightbox: (src: string | null) => void;
  setMobileNavOpen: (v: boolean) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
      planView: 'table',
      sort: { key: 'publishDate', dir: 'asc' },
      bankView: 'cards',
      calendarMode: 'month',
      freezeUntil: 'publishDate',
      // Expanded insights by default only on tall screens so the sheet keeps 8–12 rows visible.
      showInsights: typeof window === 'undefined' ? true : window.innerHeight >= 940,
      rowDensity: 'compact',
      insightsPlatform: 'all',
      insightsPeriod: '28d',
      insightsCustom: { since: '', until: '' },
      postColumns: [],

      month: currentMonthKey(),
      weekAnchor: null,
      filters: EMPTY_FILTERS,
      openContentId: null,
      quickAdd: { open: false },
      lightbox: null,
      mobileNavOpen: false,

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleColumn: (key) => {
        const cols = get().visibleColumns;
        set({ visibleColumns: cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key] });
      },
      setVisibleColumns: (keys) => set({ visibleColumns: keys }),
      setPlanView: (v) => set({ planView: v }),
      setSort: (key, dir) => {
        const cur = get().sort;
        const nextDir = dir ?? (cur.key === key ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc');
        set({ sort: { key, dir: nextDir } });
      },
      setBankView: (v) => set({ bankView: v }),
      setCalendarMode: (v) => set({ calendarMode: v }),
      setFreezeUntil: (v) => set({ freezeUntil: v }),
      setShowInsights: (v) => set({ showInsights: v }),
      setRowDensity: (v) => set({ rowDensity: v }),
      setInsightsPlatform: (v) => set({ insightsPlatform: v }),
      setInsightsPeriod: (v) => set({ insightsPeriod: v }),
      setInsightsCustom: (v) => set({ insightsCustom: v }),
      setPostColumns: (v) => set({ postColumns: v }),
      setMonth: (m) => set({ month: m, weekAnchor: null }),
      setWeekAnchor: (d) => set({ weekAnchor: d }),
      setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
      clearFilters: () => set({ filters: EMPTY_FILTERS }),
      openContent: (id) => set({ openContentId: id }),
      openQuickAdd: (opts) => set({ quickAdd: { open: true, ...opts } }),
      closeQuickAdd: () => set({ quickAdd: { open: false } }),
      openLightbox: (src) => set({ lightbox: src }),
      setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
    }),
    {
      name: 'kardeuce:v1:prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        visibleColumns: s.visibleColumns,
        planView: s.planView,
        sort: s.sort,
        bankView: s.bankView,
        calendarMode: s.calendarMode,
        freezeUntil: s.freezeUntil,
        showInsights: s.showInsights,
        rowDensity: s.rowDensity,
        insightsPlatform: s.insightsPlatform,
        insightsPeriod: s.insightsPeriod,
        insightsCustom: s.insightsCustom,
        postColumns: s.postColumns,
      }),
    },
  ),
);

export function activeFilterCount(f: ContentFilters): number {
  return (
    (f.search ? 1 : 0) + f.platforms.length + f.pillars.length + f.types.length + f.statuses.length + f.owners.length
  );
}
