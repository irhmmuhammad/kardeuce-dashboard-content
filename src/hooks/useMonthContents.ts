import { useMemo } from 'react';
import { useWorkspace } from '@/store/workspace';
import { useUI } from '@/store/ui';
import { computeContentHealth, computePlanInsights, inMonth, matchesFilters, sortContents } from '@/lib/analytics';
import type { ContentFilters, MonthKey } from '@/types';

/** Content for a month (no UI filters) + planning insights + health. */
export function useMonthPlan(month: MonthKey) {
  const contents = useWorkspace((s) => s.contents);
  const pillars = useWorkspace((s) => s.pillars);
  const contentTypes = useWorkspace((s) => s.settings.contentTypes);
  return useMemo(() => {
    const items = contents.filter((c) => inMonth(c, month));
    const undated = contents.filter((c) => !c.publishDate).length;
    const insights = computePlanInsights(items, month, pillars, contentTypes, undated);
    const health = computeContentHealth(insights, pillars);
    return { items, insights, health };
  }, [contents, pillars, contentTypes, month]);
}

/** Month + filter + sort pipeline used by the Content Plan views. */
export function useFilteredContents(month: MonthKey | 'all', filters?: ContentFilters) {
  const contents = useWorkspace((s) => s.contents);
  const statuses = useWorkspace((s) => s.settings.statuses);
  const uiFilters = useUI((s) => s.filters);
  const sort = useUI((s) => s.sort);
  const f = filters ?? uiFilters;
  return useMemo(() => {
    // Undated items show up in every month so they never get lost.
    const scoped = contents.filter((c) => !c.publishDate || inMonth(c, month));
    const filtered = scoped.filter((c) => matchesFilters(c, f));
    return { items: sortContents(filtered, sort, statuses), totalInMonth: scoped.length };
  }, [contents, statuses, f, sort, month]);
}
