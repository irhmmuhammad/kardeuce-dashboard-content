import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatPct } from '@/lib/utils';

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  unit?: 'count' | 'pct';
}

function DonutTooltip({ active, payload, total, unit }: { active?: boolean; payload?: { payload: DonutDatum }[]; total: number; unit: 'count' | 'pct' }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-pop)]">
      <div className="flex items-center gap-1.5 font-semibold text-ink">
        <span className="h-2 w-2 rounded-[3px]" style={{ background: d.color }} />
        {d.name}
      </div>
      <div className="mt-0.5 text-ink-3 tabular">
        {unit === 'pct' ? formatPct(d.value, 0) : `${d.value} post${d.value === 1 ? '' : 's'} · ${formatPct(total ? (d.value / total) * 100 : 0, 0)}`}
      </div>
    </div>
  );
}

/** Donut with a centred headline number. 2px surface gaps between segments. */
export function DonutChart({ data, centerValue, centerLabel, size = 180, unit = 'count' }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = total > 0 ? data.filter((d) => d.value > 0) : [{ name: 'Empty', value: 1, color: '#eef1ea' }];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={shown}
            dataKey="value"
            nameKey="name"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={shown.length > 1 ? 1.5 : 0}
            cornerRadius={4}
            stroke="#fff"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {shown.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          {total > 0 && <Tooltip content={<DonutTooltip total={total} unit={unit} />} wrapperStyle={{ zIndex: 10 }} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] leading-none font-bold tracking-tight text-ink tabular">{centerValue}</span>
        <span className="mt-1 text-[11px] text-ink-3">{centerLabel}</span>
      </div>
    </div>
  );
}
