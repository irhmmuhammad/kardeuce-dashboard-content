/** Tiny trend line for KPI cards. Gaps (undefined) break the line. */
export function Sparkline({ values, color = '#6b746d', height = 28, className }: { values: (number | undefined)[]; color?: string; height?: number; className?: string }) {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length < 2) return <div style={{ height }} className={className} />;
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const w = 100;
  const span = max - min || 1;
  const x = (i: number) => (values.length === 1 ? w : (i / (values.length - 1)) * w);
  const y = (v: number) => 2 + (1 - (v - min) / span) * (height - 4);
  const segments: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v === undefined) {
      if (cur) segments.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
  });
  if (cur) segments.push(cur);
  const lastIdx = values.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0).pop() ?? 0;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={className} style={{ height, width: '100%' }} aria-hidden>
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={x(lastIdx)} cy={y(values[lastIdx] as number)} r={2.2} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
