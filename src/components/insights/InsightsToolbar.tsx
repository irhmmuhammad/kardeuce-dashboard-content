import { AlertTriangle, CircleAlert, FlaskConical, PlugZap, RefreshCw, Unplug } from 'lucide-react';
import type { SocialPlatform } from '@shared/insights';
import { SOCIAL_PLATFORMS } from '@shared/insights';
import { useUI } from '@/store/ui';
import { useInsights, useIsSyncing, usePlatformModes } from '@/store/insights';
import { navigate } from '@/hooks/useRoute';
import { addDays, todayISO } from '@/lib/date';
import { relativeTime, type Period } from '@/lib/insights';
import { cn } from '@/lib/utils';
import { PLATFORM_COLORS } from '@/config/theme';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import type { InsightsPeriodKind, PlatformFilter } from '@/types';

export function PlatformDot({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: PLATFORM_COLORS[platform] }} />;
}

export function DemoBadge({ platforms }: { platforms: SocialPlatform[] }) {
  if (!platforms.length) return null;
  return (
    <Tooltip content={`${platforms.join(' & ')} ${platforms.length > 1 ? 'are' : 'is'} showing generated demo data. Connect in Settings → Integrations to see real numbers.`}>
      <button
        type="button"
        onClick={() => navigate('settings')}
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 text-[11.5px] font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
      >
        <FlaskConical className="h-3 w-3" />
        Demo data{platforms.length === 1 ? ` · ${platforms[0]}` : ''}
      </button>
    </Tooltip>
  );
}

export function SyncButton({ size = 'sm' }: { size?: 'xs' | 'sm' }) {
  const syncing = useIsSyncing();
  const syncNow = useInsights((s) => s.syncNow);
  const meta = useInsights((s) => s.meta);
  const last = SOCIAL_PLATFORMS.map((p) => meta.lastSyncAt[p]).filter(Boolean).sort().pop();
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[11.5px] text-ink-4 sm:inline">{syncing ? 'Syncing…' : `Synced ${relativeTime(last)}`}</span>
      <Button size={size} loading={syncing} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => syncNow()}>
        Sync now
      </Button>
    </div>
  );
}

const PERIODS: { value: InsightsPeriodKind; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '28d', label: '28d' },
  { value: '90d', label: '90d' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

/** One filter row that scopes every insight section below it. */
export function InsightsToolbar({ period, className }: { period: Period; className?: string }) {
  const platform = useUI((s) => s.insightsPlatform);
  const setPlatform = useUI((s) => s.setInsightsPlatform);
  const kind = useUI((s) => s.insightsPeriod);
  const setKind = useUI((s) => s.setInsightsPeriod);
  const custom = useUI((s) => s.insightsCustom);
  const setCustom = useUI((s) => s.setInsightsCustom);
  const modes = usePlatformModes();
  const demo = SOCIAL_PLATFORMS.filter((p) => modes[p] === 'demo' && (platform === 'all' || platform === p));

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Segmented<PlatformFilter>
        value={platform}
        onChange={setPlatform}
        options={[
          { value: 'all', label: 'All' },
          ...SOCIAL_PLATFORMS.map((p) => ({ value: p as PlatformFilter, label: p, icon: <PlatformIcon platform={p} className="h-3.5 w-3.5" /> })),
        ]}
      />
      <Segmented<InsightsPeriodKind>
        value={kind}
        onChange={(v) => {
          if (v === 'custom' && !custom.since) setCustom({ since: period.since, until: period.until });
          setKind(v);
        }}
        options={PERIODS}
      />
      {kind === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From"
            className="input h-8 w-[138px] text-[12.5px]"
            value={custom.since || period.since}
            min={addDays(todayISO(), -730)}
            max={todayISO()}
            onChange={(e) => setCustom({ since: e.target.value, until: custom.until || period.until })}
          />
          <span className="text-[12px] text-ink-4">→</span>
          <input
            type="date"
            aria-label="To"
            className="input h-8 w-[138px] text-[12.5px]"
            value={custom.until || period.until}
            max={todayISO()}
            onChange={(e) => setCustom({ since: custom.since || period.since, until: e.target.value })}
          />
        </div>
      )}
      <span className="text-[11.5px] text-ink-4">vs previous {period.days} days</span>
      <div className="ml-auto flex items-center gap-2">
        <DemoBadge platforms={demo} />
        <SyncButton />
      </div>
    </div>
  );
}

/** Errors, partial failures, stale (disconnected) platforms and server problems, in plain words. */
export function SyncStatusBanner({ platforms }: { platforms: SocialPlatform[] }) {
  const sync = useInsights((s) => s.sync);
  const meta = useInsights((s) => s.meta);
  const serverError = useInsights((s) => s.serverError);
  const integrations = useInsights((s) => s.integrations);
  const modes = usePlatformModes();
  const items: { key: string; tone: 'error' | 'warn' | 'info'; icon: React.ReactNode; text: React.ReactNode }[] = [];

  for (const p of platforms) {
    const st = sync[p];
    if (st.syncing) continue;
    if (st.errors.length) {
      items.push({
        key: `${p}-err`,
        tone: 'error',
        icon: <CircleAlert className="h-3.5 w-3.5" />,
        text: (
          <>
            <b>{p}:</b> {st.errors.join(' · ')}
            {meta.lastSyncAt[p] && <span className="text-red-700/70"> Showing data from {relativeTime(meta.lastSyncAt[p])}.</span>}
          </>
        ),
      });
    } else if (meta.lastError[p] && !st.warnings.length) {
      items.push({ key: `${p}-last`, tone: 'warn', icon: <AlertTriangle className="h-3.5 w-3.5" />, text: <><b>{p}:</b> last sync had a problem: {meta.lastError[p]}</> });
    }
    if (st.warnings.length) {
      items.push({ key: `${p}-warn`, tone: 'info', icon: <AlertTriangle className="h-3.5 w-3.5" />, text: <><b>{p}:</b> {st.warnings.join(' · ')}</> });
    }
    const integ = integrations?.find((i) => i.platform === p);
    if (modes[p] === 'stale') {
      items.push({
        key: `${p}-stale`,
        tone: 'warn',
        icon: <Unplug className="h-3.5 w-3.5" />,
        text: (
          <>
            <b>{p}</b> is disconnected{integ?.error ? ` (${integ.error})` : ''}. Showing data last synced {relativeTime(meta.lastSyncAt[p])}.{' '}
            <button type="button" className="font-semibold underline" onClick={() => navigate('settings')}>
              Reconnect
            </button>
          </>
        ),
      });
    } else if (integ?.error) {
      items.push({ key: `${p}-tok`, tone: 'warn', icon: <PlugZap className="h-3.5 w-3.5" />, text: <><b>{p}:</b> {integ.error}</> });
    }
  }
  if (serverError && platforms.some((p) => modes[p] !== 'demo')) {
    items.push({ key: 'server', tone: 'error', icon: <CircleAlert className="h-3.5 w-3.5" />, text: serverError });
  }
  if (!items.length) return null;
  const toneCls = { error: 'bg-red-50 text-red-800 ring-red-200', warn: 'bg-amber-50 text-amber-900 ring-amber-200', info: 'bg-canvas text-ink-2 ring-line' };
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.key} role={i.tone === 'error' ? 'alert' : undefined} className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ring-1', toneCls[i.tone])}>
          <span className="mt-0.5 shrink-0">{i.icon}</span>
          <span className="min-w-0">{i.text}</span>
        </div>
      ))}
    </div>
  );
}
