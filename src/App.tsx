import { useInsights } from '@/store/insights';
import { ConflictDialog } from '@/components/insights/ConflictDialog';
import { LinkContentModal } from '@/components/insights/PostPieces';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { useRoute } from '@/hooks/useRoute';
import { useWorkspace } from '@/store/workspace';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { hasOpenLayer } from '@/lib/layers';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { Toaster } from '@/components/ui/Toaster';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Lightbox } from '@/components/ui/Lightbox';
import { ContentDrawer } from '@/components/content/ContentDrawer';
import { QuickAddModal } from '@/components/content/QuickAddModal';
import type { RouteKey } from '@/types';

// Each page is its own chunk so the first load stays light.
const page = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const PAGES: Record<RouteKey, ComponentType> = {
  dashboard: page(() => import('@/pages/DashboardPage'), 'DashboardPage'),
  strategy: page(() => import('@/pages/StrategyPage'), 'StrategyPage'),
  plan: page(() => import('@/pages/ContentPlanPage'), 'ContentPlanPage'),
  calendar: page(() => import('@/pages/CalendarPage'), 'CalendarPage'),
  bank: page(() => import('@/pages/ContentBankPage'), 'ContentBankPage'),
  performance: page(() => import('@/pages/PerformancePage'), 'PerformancePage'),
  settings: page(() => import('@/pages/SettingsPage'), 'SettingsPage'),
};

const TITLES: Record<RouteKey, string> = {
  dashboard: 'Dashboard',
  strategy: 'Content Strategy',
  plan: 'Content Plan',
  calendar: 'Calendar',
  bank: 'Content Bank',
  performance: 'Performance',
  settings: 'Settings',
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

export function App() {
  const route = useRoute();
  const status = useWorkspace((s) => s.status);
  const hydrate = useWorkspace((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Insights load after the workspace (linking needs the content), then auto-sync if stale.
  useEffect(() => {
    if (status === 'ready') void useInsights.getState().hydrate();
  }, [status]);

  useEffect(() => {
    document.title = `${TITLES[route]} · KARDEUCE`;
  }, [route]);

  // Global shortcuts: N = new content, Cmd/Ctrl+S = save confirmation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasOpenLayer()) return;
        toast.success('All changes saved', 'Your workspace autosaves to this browser.');
        return;
      }
      if (e.defaultPrevented || mod || e.altKey || isTyping(e.target) || hasOpenLayer()) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        useUI.getState().openQuickAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const Page = PAGES[route];

  return (
    <div className="flex h-full overflow-hidden bg-canvas">
      <Sidebar route={route} />
      <main className={cn('min-w-0 flex-1 overflow-x-hidden', 'overflow-y-auto')}>
        {status === 'loading' ? (
          <PageSkeleton />
        ) : (
          <Suspense fallback={<PageSkeleton />}>
            <Page key={route} />
          </Suspense>
        )}
      </main>
      {status === 'ready' && (
        <>
          <ContentDrawer />
          <QuickAddModal />
          <LinkContentModal />
          <ConflictDialog />
        </>
      )}
      <ConfirmDialog />
      <Lightbox />
      <Toaster />
    </div>
  );
}
