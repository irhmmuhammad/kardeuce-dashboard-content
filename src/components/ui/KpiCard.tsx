import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/charts/Sparkline';
import { Tooltip } from './Tooltip';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  delta?: number | null; // percentage change vs previous period
  accent?: boolean;
  className?: string;
  onClick?: () => void;
  /** Daily values for a small trend line under the number. */
  sparkline?: (number | undefined)[];
  sparklineColor?: string;
  /** Explanation shown on hover of the ⓘ next to the label. */
  info?: ReactNode;
  /** Muted loading state that keeps the card's size. */
  loading?: boolean;
}

export function KpiCard({ label, value, icon, hint, delta, accent, className, onClick, sparkline, sparklineColor, info, loading }: KpiCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'card group relative flex flex-col justify-between overflow-hidden p-4 text-left transition-colors',
        accent && 'border-ink bg-ink text-white',
        onClick && 'hover:border-line-strong',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium', accent ? 'text-white/70' : 'text-ink-3')}>
          {label}
          {info && (
            <Tooltip content={info}>
              <span className="inline-flex cursor-help" aria-label="How this is calculated">
                <Info className="h-3 w-3 opacity-70" />
              </span>
            </Tooltip>
          )}
        </span>
        {icon && (
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg',
              accent ? 'bg-brand text-ink' : 'bg-muted text-ink-2 group-hover:bg-brand-soft',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        {loading ? (
          <span className={cn('h-[26px] w-20 animate-pulse rounded-md', accent ? 'bg-white/15' : 'bg-[#e9ece5]')} />
        ) : (
          <span className="text-[26px] leading-none font-bold tracking-tight">{value}</span>
        )}
        {delta !== undefined && delta !== null && Number.isFinite(delta) && Math.abs(delta) >= 0.5 && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular',
              delta >= 0 ? (accent ? 'bg-brand/20 text-brand' : 'bg-emerald-50 text-emerald-700') : accent ? 'bg-red-400/20 text-red-300' : 'bg-red-50 text-red-600',
            )}
          >
            {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      {sparkline && !loading && <Sparkline values={sparkline} color={sparklineColor ?? (accent ? '#b7e46c' : '#6b746d')} height={26} className="mt-2.5" />}
      {hint && <div className={cn('mt-1.5 text-[11.5px]', accent ? 'text-white/55' : 'text-ink-4')}>{hint}</div>}
    </Comp>
  );
}
