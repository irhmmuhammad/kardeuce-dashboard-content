import { Activity, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import type { ContentHealth } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const LEVEL_STYLE = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
};

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? '#10b981' : score >= 55 ? '#eda100' : '#e34948';
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#eef1ea" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-ink tabular">{score}</span>
    </div>
  );
}

export function ContentHealthCard({ health, className, showMessages = true }: { health: ContentHealth; className?: string; showMessages?: boolean }) {
  return (
    <div className={cn('card p-4', className)}>
      <div className="flex items-center gap-3">
        <ScoreRing score={health.score} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Activity className="h-3.5 w-3.5 text-ink-3" /> Content Health
          </div>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {health.indicators.length === 0 ? 'No content yet' : health.score >= 80 ? 'Plan looks solid' : health.score >= 55 ? 'A few things to tune' : 'Needs attention'}
          </p>
        </div>
      </div>
      {health.indicators.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {health.indicators.map((ind) => (
            <div key={ind.key} className="flex items-center gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 leading-tight text-ink-2" title={ind.detail}>
                {ind.label}
              </span>
              <span className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset', LEVEL_STYLE[ind.tone])}>
                {ind.tone === 'good' ? <CircleCheck className="h-3 w-3" /> : ind.tone === 'warn' ? <CircleAlert className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
                {ind.level}
              </span>
            </div>
          ))}
        </div>
      )}
      {showMessages && health.messages.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {health.messages.map((m) => (
            <li key={m.text} className="flex gap-1.5 text-[12px] leading-snug text-ink-2">
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              {m.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
