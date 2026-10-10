import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, currentMonthKey, monthLabel } from '@/lib/date';
import { useUI } from '@/store/ui';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

export function MonthNavigator({ className, showToday = true }: { className?: string; showToday?: boolean }) {
  const month = useUI((s) => s.month);
  const setMonth = useUI((s) => s.setMonth);
  const isCurrent = month === currentMonthKey();
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className="flex h-9 items-center rounded-[10px] border border-line bg-white">
        <Tooltip content="Previous month">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            className="flex h-full w-8 items-center justify-center rounded-l-[10px] text-ink-3 hover:bg-muted hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </Tooltip>
        <span className="min-w-[124px] px-1 text-center text-[13px] font-semibold text-ink tabular">{monthLabel(month)}</span>
        <Tooltip content="Next month">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            className="flex h-full w-8 items-center justify-center rounded-r-[10px] text-ink-3 hover:bg-muted hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
      {showToday && (
        <button
          type="button"
          onClick={() => setMonth(currentMonthKey())}
          disabled={isCurrent}
          className="h-9 rounded-[10px] border border-line bg-white px-3 text-[12.5px] font-medium text-ink-2 hover:bg-muted disabled:cursor-default disabled:opacity-50"
        >
          Today
        </button>
      )}
    </div>
  );
}
