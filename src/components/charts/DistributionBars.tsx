import { Tooltip } from '@/components/ui/Tooltip';
import { cn, formatPct } from '@/lib/utils';
import type { DistributionRow } from '@/lib/analytics';

interface DistributionBarsProps {
  rows: DistributionRow[];
  /** Single-series bars use one neutral colour; pillar bars use their own. */
  color?: string;
  showRecommended?: boolean;
  compact?: boolean;
  icon?: (name: string) => React.ReactNode;
}

export function DistributionBars({ rows, color = '#3c463f', showRecommended, compact, icon }: DistributionBarsProps) {
  const max = Math.max(...rows.map((r) => Math.max(r.pct, r.recommended ?? 0)), 1);
  const scale = showRecommended ? 100 : max;
  return (
    <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
      {rows.map((r) => {
        const diff = r.recommended !== undefined ? r.pct - r.recommended : 0;
        return (
          <div key={r.name}>
            <div className="mb-1 flex items-center gap-2 text-[12.5px]">
              {icon ? icon(r.name) : r.color ? <span className="h-2 w-2 rounded-[3px]" style={{ background: r.color }} /> : null}
              <span className="font-medium text-ink">{r.name}</span>
              <span className="ml-auto text-ink-3 tabular">
                {r.count} · <span className="font-semibold text-ink">{formatPct(r.pct, 0)}</span>
              </span>
              {showRecommended && r.recommended !== undefined && (
                <Tooltip content={`Recommended ${r.recommended}%`}>
                  <span
                    className={cn(
                      'w-12 text-right text-[11px] font-medium tabular',
                      Math.abs(diff) <= 5 ? 'text-ink-4' : diff > 0 ? 'text-amber-700' : 'text-red-600',
                    )}
                  >
                    {Math.abs(diff) <= 5 ? 'on target' : `${diff > 0 ? '+' : ''}${Math.round(diff)}%`}
                  </span>
                </Tooltip>
              )}
            </div>
            <div className={cn('relative w-full overflow-visible rounded-full bg-muted', compact ? 'h-1.5' : 'h-2')}>
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.min(100, (r.pct / scale) * 100)}%`, background: r.color ?? color }}
              />
              {showRecommended && r.recommended !== undefined && (
                <span
                  className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-ink"
                  style={{ left: `calc(${Math.min(100, (r.recommended / scale) * 100)}% - 1px)` }}
                  title={`Recommended ${r.recommended}%`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 100% stacked bar of pillar mix with a 2px surface gap between segments. */
export function StackedBar({ rows, height = 10 }: { rows: DistributionRow[]; height?: number }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!total) return <div className="w-full rounded-full bg-muted" style={{ height }} />;
  return (
    <div className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height }}>
      {rows
        .filter((r) => r.count > 0)
        .map((r) => (
          <Tooltip key={r.name} content={`${r.name}: ${r.count} (${formatPct(r.pct, 0)})`}>
            <div className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${r.pct}%`, background: r.color }} />
          </Tooltip>
        ))}
    </div>
  );
}
