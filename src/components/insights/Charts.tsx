import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import type { SocialPlatform } from '@shared/insights';
import { PLATFORM_COLORS } from '@/config/theme';
import { cn } from '@/lib/utils';
import { HOUR_BUCKETS, WEEKDAYS, type GroupRow, type HeatCell } from '@/lib/insights';
import { PlatformDot } from './InsightsToolbar';

const AXIS_TICK = { fontSize: 11, fill: '#9aa29c' };
const GRID = '#eef1ea';

export function PlatformLegend({ platforms, className }: { platforms: SocialPlatform[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 text-[11.5px] text-ink-2', className)}>
      {platforms.map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5">
          <PlatformDot platform={p} />
          {p}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { dataKey?: unknown; value?: unknown }[]; label?: unknown; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-pop)]">
      <div className="mb-0.5 font-semibold text-ink">{String(label)}</div>
      {payload
        .filter((p) => typeof p.value === 'number')
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-1.5 text-ink-2">
            <PlatformDot platform={p.dataKey as SocialPlatform} />
            <span className="flex-1">{String(p.dataKey)}</span>
            <b className="ml-3 text-ink tabular">{format(p.value as number)}</b>
          </div>
        ))}
    </div>
  );
}

type TrendRow = { label: string; Instagram?: number; TikTok?: number };

/** One line per platform, one shared axis, direct label at each line's end. */
export function PlatformLineChart({
  rows,
  platforms,
  format,
  height = 220,
  yDomain,
}: {
  rows: TrendRow[];
  platforms: SocialPlatform[];
  format: (v: number) => string;
  height?: number;
  yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
}) {
  const lastIndex = (p: SocialPlatform) => rows.map((r, i) => (r[p] !== undefined ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  // Two end labels can land on top of each other: nudge the higher line's label up, the lower one's down.
  const endValue = (p: SocialPlatform) => rows[lastIndex(p)]?.[p];
  const labelDy = (p: SocialPlatform) => {
    if (platforms.length < 2) return 4;
    const mine = endValue(p);
    const other = endValue(platforms.find((x) => x !== p)!);
    if (mine === undefined || other === undefined) return 4;
    return mine >= other && p === platforms[0] ? -3 : mine > other ? -3 : 11;
  };
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 56, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#e5e7e5' }} tick={AXIS_TICK} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={48} tickFormatter={(v: number) => format(v)} domain={yDomain ?? ['auto', 'auto']} />
          <RTooltip cursor={{ stroke: '#d6d9d5', strokeWidth: 1 }} content={(props) => <ChartTooltip {...(props as object)} format={format} />} />
          {platforms.map((p) => {
            const end = lastIndex(p);
            const dy = labelDy(p);
            return (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                stroke={PLATFORM_COLORS[p]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={p}
                  content={(props) => {
                    const { index, x, y, value } = props as { index?: number; x?: number; y?: number; value?: number };
                    if (index !== end || x === undefined || y === undefined || value === undefined) return null;
                    return (
                      <text x={x + 6} y={y} dy={dy} fontSize={11} fontWeight={600} fill="#17211a">
                        {format(value)}
                      </text>
                    );
                  }}
                />
              </Line>
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bars grouped by category, one bar per platform. */
export function GroupedPlatformBars({ rows, platforms, format, height = 240 }: { rows: GroupRow[]; platforms: SocialPlatform[]; format: (v: number) => string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%" barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#e5e7e5' }} tick={{ fontSize: 11.5, fill: '#3c463f' }} interval={0} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={44} tickFormatter={(v: number) => format(v)} />
          <RTooltip
            cursor={{ fill: 'rgba(23,33,26,0.04)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as GroupRow;
              return (
                <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-pop)]">
                  <div className="mb-0.5 font-semibold text-ink">{String(label)}</div>
                  {platforms.map((p) => (
                    <div key={p} className="flex items-center gap-1.5 text-ink-2">
                      <PlatformDot platform={p} />
                      <span className="flex-1">{p}</span>
                      <b className="ml-3 text-ink tabular">{row[p] !== undefined ? format(row[p]!) : '—'}</b>
                      <span className="text-[11px] text-ink-4">{row.posts[p] ?? 0} posts</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {platforms.map((p) => (
            <Bar key={p} dataKey={p} fill={PLATFORM_COLORS[p]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              {platforms.length === 1 && <LabelList dataKey={p} position="top" formatter={(v: number) => (v !== undefined ? format(v) : '')} style={{ fontSize: 11, fontWeight: 600, fill: '#17211a' }} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Day × time-slot grid; darker = higher engagement than average (one hue, light → dark). */
export function BestTimeHeatmap({ cells }: { cells: HeatCell[] }) {
  const max = Math.max(1.0001, ...cells.map((c) => c.index ?? 0));
  const min = Math.min(0.9999, ...cells.filter((c) => c.index !== null).map((c) => c.index!));
  const shade = (idx: number) => {
    const t = (idx - min) / (max - min || 1);
    return `rgba(23, 33, 26, ${(0.08 + t * 0.82).toFixed(3)})`;
  };
  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `34px repeat(${HOUR_BUCKETS.length}, minmax(0, 1fr))` }}>
        <span />
        {HOUR_BUCKETS.map((b) => (
          <span key={b.label} className="pb-1 text-center text-[10px] text-ink-4 tabular">
            {b.label}
          </span>
        ))}
        {WEEKDAYS.map((day, d) => (
          <div key={day} className="contents">
            <span className="flex items-center text-[11px] text-ink-3">{day}</span>
            {HOUR_BUCKETS.map((b, bi) => {
              const c = cells.find((x) => x.day === d && x.bucket === bi)!;
              const label = c.posts
                ? `${day} ${b.label}: ${c.posts} post${c.posts > 1 ? 's' : ''}, avg ER ${c.avgEr?.toFixed(2)}% (${c.index! >= 1 ? '+' : ''}${((c.index! - 1) * 100).toFixed(0)}% vs avg)`
                : `${day} ${b.label}: no posts`;
              return (
                <div
                  key={b.label}
                  title={label}
                  aria-label={label}
                  className={cn('h-7 rounded-[5px]', !c.posts && 'bg-muted/60')}
                  style={c.posts && c.index !== null ? { background: shade(c.index) } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-4">
        <span>Lower ER</span>
        <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(23,33,26,0.08), rgba(23,33,26,0.9))' }} />
        <span>Higher ER</span>
        <span className="ml-auto">Empty = no posts in that slot</span>
      </div>
    </div>
  );
}
