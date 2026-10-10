import { ChevronDown, CircleCheck, Info, Sparkles, TriangleAlert } from 'lucide-react';
import { useMonthPlan } from '@/hooks/useMonthContents';
import { useUI } from '@/store/ui';
import { monthLabel, monthName } from '@/lib/date';
import { cn, formatPct } from '@/lib/utils';
import { DistributionBars, StackedBar } from '@/components/charts/DistributionBars';
import { typeIcon } from '@/components/badges/Badges';
import type { Insight } from '@/lib/analytics';
import type { MonthKey } from '@/types';
import { ContentHealthCard } from './ContentHealthCard';

export function InsightChip({ insight }: { insight: Insight }) {
  const Icon = insight.severity === 'warning' ? TriangleAlert : insight.severity === 'success' ? CircleCheck : Info;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[12px] leading-snug font-medium',
        insight.severity === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
        insight.severity === 'info' && 'border-line bg-white text-ink-2',
        insight.severity === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {insight.message}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-ink-3">{label}</div>
      <div className="mt-0.5 text-[20px] leading-none font-bold tracking-tight text-ink tabular">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-ink-4">{sub}</div>}
    </div>
  );
}

/** Planning insight strip shown above the Content Plan table. */
export function PlanInsights({ month }: { month: MonthKey }) {
  const { insights, health } = useMonthPlan(month);
  const open = useUI((s) => s.showInsights);
  const setOpen = useUI((s) => s.setShowInsights);
  const warningList = insights.insights.filter((i) => i.severity === 'warning');
  const warnings = warningList.length;
  const topWarning = warningList[0];

  return (
    <section className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas/60">
        <Sparkles className="h-4 w-4 text-brand-ink" />
        <span className="text-[13px] font-semibold text-ink">Planning Insights</span>
        <span className="text-[12px] text-ink-3">{monthLabel(month)}</span>
        {!open && insights.total > 0 && (
          <span className="hidden min-w-0 flex-1 items-center gap-3 overflow-hidden md:flex">
            <span className="text-[12px] text-ink-2 tabular">
              <b>{insights.total}</b> planned · {insights.postsPerWeek.toFixed(1)}/week
            </span>
            <span className="w-40">
              <StackedBar rows={insights.pillars} height={6} />
            </span>
            <span className="text-[12px] whitespace-nowrap text-ink-2">
              Health <b className="tabular">{health.score}</b>
            </span>
            {topWarning && (
              <span className="hidden min-w-0 items-center gap-1.5 truncate text-[12px] text-amber-800 xl:inline-flex">
                <TriangleAlert className="h-3 w-3 shrink-0" />
                <span className="truncate">{topWarning.message}</span>
                {warnings > 1 && <span className="shrink-0 text-ink-4">+{warnings - 1} more</span>}
              </span>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {warnings > 0 && (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-50 px-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset">
              <TriangleAlert className="h-3 w-3" /> {warnings}
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 text-ink-3 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="border-t border-line">
          {insights.total === 0 ? (
            <p className="px-4 py-4 text-[12.5px] text-ink-3">No content planned for {monthName(month)} yet — insights appear as soon as you add content.</p>
          ) : (
            <>
              <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-[0.8fr_1.3fr_1fr_1.1fr]">
                <div className="grid grid-cols-2 content-start gap-4 bg-white p-4">
                  <Stat label="Planned posts" value={String(insights.total)} sub={monthLabel(month)} />
                  <Stat label="Posts / week" value={insights.postsPerWeek.toFixed(1)} sub="target 2–3" />
                  <Stat label="Avg. gap" value={insights.avgGap !== null ? `${insights.avgGap.toFixed(1)}d` : '—'} sub="between posts" />
                  <Stat label="Longest gap" value={insights.maxGap ? `${insights.maxGap.days}d` : '—'} sub={insights.maxGap && insights.maxGap.days > 5 ? 'too long' : 'ok'} />
                </div>
                <div className="bg-white p-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink">Pillar distribution</span>
                    <span className="text-[11px] text-ink-4">bar = actual · tick = recommended</span>
                  </div>
                  <DistributionBars rows={insights.pillars} showRecommended compact />
                </div>
                <div className="bg-white p-4">
                  <div className="mb-2.5 text-[12px] font-semibold text-ink">Format distribution</div>
                  <DistributionBars
                    rows={insights.formats.filter((f) => f.count > 0)}
                    compact
                    icon={(name) => {
                      const Icon = typeIcon(name);
                      return <Icon className="h-3 w-3 text-ink-3" />;
                    }}
                  />
                  {insights.formats.every((f) => f.count === 0) && <p className="text-[12px] text-ink-4">—</p>}
                  <p className="mt-2 text-[11px] text-ink-4">
                    Top format: <b className="text-ink-2">{insights.formats[0]?.name}</b> ({formatPct(insights.formats[0]?.pct ?? 0, 0)})
                  </p>
                </div>
                <div className="bg-white">
                  <ContentHealthCard health={health} showMessages={false} className="h-full rounded-none border-0" />
                </div>
              </div>
              {insights.insights.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-line bg-canvas/50 px-4 py-3">
                  {insights.insights.map((i) => (
                    <InsightChip key={i.id} insight={i} />
                  ))}
                  {health.messages
                    .filter((m) => !m.covers.some((id) => insights.insights.some((i) => i.id === id)))
                    .map((m) => (
                      <InsightChip key={m.text} insight={{ id: m.text, severity: 'info', message: m.text }} />
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
