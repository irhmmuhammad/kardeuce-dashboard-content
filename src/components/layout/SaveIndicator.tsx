import { useEffect, useState } from 'react';
import { useWorkspace } from '@/store/workspace';
import { Tooltip } from '@/components/ui/Tooltip';

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "All changes saved · just now" — autosave feedback for the spreadsheet. */
export function SaveIndicator({ dark }: { dark?: boolean }) {
  const lastSavedAt = useWorkspace((s) => s.lastSavedAt);
  const [, tick] = useState(0);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!lastSavedAt) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [lastSavedAt]);
  if (!lastSavedAt) return null;
  return (
    <Tooltip content="Changes are saved automatically in this browser (localStorage).">
      <span className={`inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap ${dark ? 'text-white/45' : 'text-ink-3'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${pulse ? 'animate-ping bg-brand' : dark ? 'bg-brand' : 'bg-emerald-500'}`} />
        Saved · {ago(lastSavedAt)}
      </span>
    </Tooltip>
  );
}
