import { useEffect, useState } from 'react';
import { useInsights } from '@/store/insights';
import { fmtMetric } from '@/lib/insights';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import type { PostMetrics } from '@/types';

const KEYS: { key: keyof PostMetrics; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'reach', label: 'Reach' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
];

/**
 * Shown when a sync brings numbers for content that already has manually
 * typed metrics. Nothing is overwritten until the team picks a side.
 */
export function ConflictDialog() {
  const conflicts = useInsights((s) => s.conflicts);
  const resolve = useInsights((s) => s.resolveConflicts);
  const [choice, setChoice] = useState<Record<string, 'manual' | 'synced'>>({});
  const [dismissed, setDismissed] = useState(false);
  const keyOf = (c: (typeof conflicts)[number]) => `${c.contentId}:${c.platform}`;

  useEffect(() => {
    if (conflicts.length) setDismissed(false);
  }, [conflicts.length]);

  const apply = (all?: 'manual' | 'synced') =>
    resolve(conflicts.map((c) => ({ conflict: c, use: all ?? choice[keyOf(c)] ?? 'manual' })));

  return (
    <Modal
      open={conflicts.length > 0 && !dismissed}
      onClose={() => setDismissed(true)}
      size="lg"
      persistent
      title="Synced numbers differ from manual input"
      description={`${conflicts.length} content item${conflicts.length > 1 ? 's have' : ' has'} numbers typed in by hand. Choose which to keep. Manual numbers are never replaced without asking.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setDismissed(true)}>
            Decide later
          </Button>
          <div className="flex-1" />
          <Button onClick={() => apply('manual')}>Keep all manual</Button>
          <Button onClick={() => apply('synced')}>Use all synced</Button>
          <Button variant="primary" onClick={() => apply()}>
            Apply choices
          </Button>
        </>
      }
    >
      <ul className="scrollbar-thin max-h-[52vh] space-y-3 overflow-y-auto">
        {conflicts.map((c) => {
          const k = keyOf(c);
          const pick = choice[k] ?? 'manual';
          return (
            <li key={k} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
                <PlatformIcon platform={c.platform} />
                <span className="truncate">{c.contentTitle}</span>
              </div>
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[420px] text-[12px]">
                  <thead>
                    <tr className="text-ink-4">
                      <th className="w-28 py-1 text-left font-medium" />
                      {KEYS.map((m) => (
                        <th key={m.key} className="py-1 text-right font-medium">
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(['manual', 'synced'] as const).map((side) => (
                      <tr key={side} className={cn('cursor-pointer', pick === side && 'bg-brand-soft')} onClick={() => setChoice((s) => ({ ...s, [k]: side }))}>
                        <td className="rounded-l-md py-1.5 pl-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-ink">
                            <input type="radio" name={k} checked={pick === side} onChange={() => setChoice((s) => ({ ...s, [k]: side }))} />
                            {side === 'manual' ? 'Manual' : c.post.source === 'mock' ? 'Synced (demo)' : 'Synced'}
                          </label>
                        </td>
                        {KEYS.map((m) => (
                          <td key={m.key} className="py-1.5 text-right text-ink tabular last:rounded-r-md last:pr-2">
                            {fmtMetric((side === 'manual' ? c.manual : c.synced)[m.key] as number | undefined)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
