import {
  CalendarDays,
  ChartColumn,
  Compass,
  LayoutDashboard,
  Lightbulb,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Table2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { navigate } from '@/hooks/useRoute';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { cn } from '@/lib/utils';
import { inMonth } from '@/lib/analytics';
import type { RouteKey } from '@/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { LogoMark } from './Logo';
import { SaveIndicator } from './SaveIndicator';

const NAV: { key: RouteKey; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'strategy', label: 'Content Strategy', icon: Compass },
  { key: 'plan', label: 'Content Plan', icon: Table2 },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'bank', label: 'Content Bank', icon: Lightbulb },
  { key: 'performance', label: 'Performance', icon: ChartColumn },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ route }: { route: RouteKey }) {
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const setCollapsed = useUI((s) => s.setSidebarCollapsed);
  const mobileOpen = useUI((s) => s.mobileNavOpen);
  const setMobileOpen = useUI((s) => s.setMobileNavOpen);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const month = useUI((s) => s.month);
  const contents = useWorkspace((s) => s.contents);
  const ideas = useWorkspace((s) => s.ideas);

  const counts = useMemo<Partial<Record<RouteKey, number>>>(
    () => ({
      plan: contents.filter((c) => inMonth(c, month)).length,
      bank: ideas.filter((i) => !i.movedToContentId).length,
    }),
    [contents, ideas, month],
  );

  const go = (key: RouteKey) => {
    navigate(key);
    setMobileOpen(false);
  };

  const isCollapsed = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 animate-fade-in bg-ink/40 md:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={cn(
          'z-50 flex h-full shrink-0 flex-col bg-ink text-white transition-[width,transform] duration-200',
          'fixed inset-y-0 left-0 md:static',
          mobileOpen ? 'w-[260px] translate-x-0' : '-translate-x-full md:translate-x-0',
          isCollapsed ? 'md:w-[68px]' : 'md:w-[236px]',
        )}
      >
        <div className={cn('flex h-16 items-center gap-2.5 px-4', isCollapsed && 'md:justify-center md:px-0')}>
          <button type="button" onClick={() => go('dashboard')} className="flex items-center gap-2.5" aria-label="KARDEUCE home">
            <LogoMark size={30} />
            {!isCollapsed && <span className="text-[15px] font-extrabold tracking-[0.08em]">KARDEUCE</span>}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={cn('px-3 pb-3', isCollapsed && 'md:px-2.5')}>
          <Tooltip content={isCollapsed ? 'Add content (N)' : null} side="right">
            <button
              type="button"
              onClick={() => {
                openQuickAdd();
                setMobileOpen(false);
              }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-[10px] bg-brand text-[13px] font-semibold text-ink transition-colors hover:bg-[#c4ec80]',
                isCollapsed ? 'md:justify-center' : 'px-3',
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">Add Content</span>
                  <span className="rounded-md bg-ink/10 px-1.5 font-mono text-[10px]">N</span>
                </>
              )}
            </button>
          </Tooltip>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          {!isCollapsed && <div className="px-2.5 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.12em] text-white/35 uppercase">Workspace</div>}
          {NAV.map(({ key, label, icon: Icon }) => {
            const active = route === key;
            const count = counts[key];
            return (
              <Tooltip key={key} content={isCollapsed ? label : null} side="right">
                <button
                  type="button"
                  onClick={() => go(key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-9 w-full items-center gap-3 rounded-[10px] text-[13px] font-medium transition-colors',
                    isCollapsed ? 'md:justify-center' : 'px-2.5',
                    active ? 'bg-white/[0.09] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
                  )}
                >
                  {active && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-brand" />}
                  <Icon className={cn('h-[17px] w-[17px] shrink-0', active ? 'text-brand' : '')} strokeWidth={active ? 2.2 : 1.9} />
                  {!isCollapsed && <span className="flex-1 text-left">{label}</span>}
                  {!isCollapsed && count !== undefined && count > 0 && (
                    <span className={cn('rounded-md px-1.5 text-[11px] tabular', active ? 'bg-brand text-ink' : 'bg-white/10 text-white/70')}>{count}</span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </nav>

        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'hidden h-8 w-full items-center gap-2 rounded-lg text-[12px] text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white md:flex',
              isCollapsed ? 'justify-center' : 'px-2.5',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!isCollapsed && 'Collapse'}
          </button>
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-2.5',
              isCollapsed && 'md:justify-center md:border-transparent md:bg-transparent md:p-0',
            )}
          >
            <LogoMark size={32} />
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-bold tracking-[0.06em]">KARDEUCE</div>
                <div className="truncate text-[11px] text-white/50">Social Media Workspace</div>
                <div className="mt-1">
                  <SaveIndicator dark />
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
