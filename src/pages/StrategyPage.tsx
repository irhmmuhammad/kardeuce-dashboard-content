import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Target, Trash, TriangleAlert, Users, X } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { useMonthPlan } from '@/hooks/useMonthContents';
import { contentER, hasMetrics, stageOf } from '@/lib/analytics';
import { monthLabel } from '@/lib/date';
import { cn, formatPct } from '@/lib/utils';
import { PILLAR_PALETTE, alpha } from '@/config/theme';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, TagInput, AutoTextarea } from '@/components/ui/Field';
import { DonutChart } from '@/components/charts/DonutChart';
import type { BrandProfile, Pillar } from '@/types';

function PillarCard({ pillar, index, stats }: { pillar: Pillar; index: number; stats: { month: number; monthPct: number; er: number | null; total: number } }) {
  const updatePillar = useWorkspace((s) => s.updatePillar);
  const deletePillar = useWorkspace((s) => s.deletePillar);
  const usage = useWorkspace((s) => s.contents.filter((c) => c.contentPillar === pillar.name).length);
  const pillars = useWorkspace((s) => s.pillars);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pillar);

  const start = () => {
    setDraft(pillar);
    setEditing(true);
  };
  const save = () => {
    const name = draft.name.trim();
    if (!name) return toast.error('Pillar name can’t be empty');
    if (pillars.some((p) => p.id !== pillar.id && p.name.toLowerCase() === name.toLowerCase())) return toast.error('Another pillar already uses that name');
    updatePillar(pillar.id, { ...draft, name, recommendedPct: Math.max(0, Math.min(100, Math.round(draft.recommendedPct))) });
    setEditing(false);
    toast.success('Pillar updated', name !== pillar.name ? `Renamed across ${usage} content item${usage === 1 ? '' : 's'}.` : undefined);
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${pillar.name}” pillar?`,
      description: usage ? `${usage} content item${usage === 1 ? '' : 's'} still use this pillar. They’ll keep the label but it won’t be part of your strategy anymore.` : 'This pillar isn’t used by any content.',
      confirmLabel: 'Delete pillar',
    });
    if (!ok) return;
    deletePillar(pillar.id);
    toast.success('Pillar deleted');
  };

  const set = <K extends keyof Pillar>(k: K, v: Pillar[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <article className="card relative flex flex-col overflow-hidden">
      <div className="h-1.5" style={{ background: pillar.color }} />
      <div className="flex-1 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white" style={{ background: pillar.color }}>
            {String(index + 1).padStart(2, '0')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold tracking-[0.14em] text-ink-4 uppercase">Pillar {index + 1}</div>
            {editing ? (
              <input className="input mt-1 !h-9 !text-[16px] font-bold" value={draft.name} onChange={(e) => set('name', e.target.value)} />
            ) : (
              <h3 className="text-[19px] leading-tight font-bold tracking-tight text-ink">{pillar.name}</h3>
            )}
          </div>
          {!editing ? (
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={start} aria-label="Edit pillar">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={remove} aria-label="Delete pillar" className="hover:!text-red-600">
                <Trash className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon-sm" variant="primary" onClick={save} aria-label="Save">
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-4 space-y-3">
            <Field label="Purpose / description">
              <AutoTextarea value={draft.description} onChange={(e) => set('description', e.target.value)} minRows={2} />
            </Field>
            <Field label="Objective">
              <input className="input" value={draft.objective} onChange={(e) => set('objective', e.target.value)} placeholder="e.g. Awareness & Engagement" />
            </Field>
            <Field label="Target KPI">
              <TagInput value={draft.kpis} onChange={(v) => set('kpis', v)} placeholder="Reach, Shares… (Enter to add)" />
            </Field>
            <Field label="Content examples / typical topics">
              <TagInput value={draft.examples} onChange={(v) => set('examples', v)} placeholder="Tennis memes, Beginner tips…" />
            </Field>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <Field label="Recommended percentage">
                <div className="flex items-center gap-3">
                  <input type="range" min={0} max={100} step={5} value={draft.recommendedPct} onChange={(e) => set('recommendedPct', Number(e.target.value))} className="flex-1 accent-[#17211a]" />
                  <div className="relative w-20">
                    <input type="number" min={0} max={100} className="input pr-6 tabular" value={draft.recommendedPct} onChange={(e) => set('recommendedPct', Number(e.target.value) || 0)} />
                    <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-4">%</span>
                  </div>
                </div>
              </Field>
            </div>
            <Field label="Colour">
              <div className="flex gap-1.5">
                {PILLAR_PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => set('color', c)} className={cn('h-7 w-7 rounded-lg ring-offset-2', draft.color === c && 'ring-2 ring-ink')} style={{ background: c }} aria-label={`Use colour ${c}`} />
                ))}
              </div>
            </Field>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">{pillar.description || <span className="text-ink-4">No purpose defined yet.</span>}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-canvas p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                  <Target className="h-3 w-3" /> Objective
                </div>
                <div className="mt-1 text-[13px] font-semibold text-ink">{pillar.objective || '—'}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: alpha(pillar.color, 0.08) }}>
                <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Recommended</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-[22px] leading-none font-bold text-ink tabular">{pillar.recommendedPct}%</span>
                  <span className="text-[11.5px] text-ink-3">of monthly posts</span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Primary KPI</div>
              <div className="flex flex-wrap gap-1.5">
                {pillar.kpis.length ? (
                  pillar.kpis.map((k) => (
                    <span key={k} className="rounded-md border border-line bg-white px-2 py-0.5 text-[12px] font-semibold text-ink">
                      {k}
                    </span>
                  ))
                ) : (
                  <span className="text-[12.5px] text-ink-4">—</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Typical topics</div>
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {pillar.examples.map((ex) => (
                  <li key={ex} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pillar.color }} />
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line bg-canvas/50 text-center">
          <div className="px-2 py-2.5">
            <div className="text-[15px] font-bold text-ink tabular">{stats.month}</div>
            <div className="text-[10.5px] text-ink-3">this month</div>
          </div>
          <div className="px-2 py-2.5">
            <div className={cn('text-[15px] font-bold tabular', Math.abs(stats.monthPct - pillar.recommendedPct) > 10 ? 'text-amber-700' : 'text-ink')}>{formatPct(stats.monthPct, 0)}</div>
            <div className="text-[10.5px] text-ink-3">actual mix</div>
          </div>
          <div className="px-2 py-2.5">
            <div className="text-[15px] font-bold text-ink tabular">{stats.er !== null ? formatPct(stats.er) : '—'}</div>
            <div className="text-[10.5px] text-ink-3">avg. ER (all time)</div>
          </div>
        </div>
      )}
    </article>
  );
}

function BrandFoundation() {
  const brand = useWorkspace((s) => s.settings.brand);
  const updateSettings = useWorkspace((s) => s.updateSettings);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandProfile>(brand);
  const set = <K extends keyof BrandProfile>(k: K, v: BrandProfile[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <section className="card p-5 lg:col-span-3">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
          <Users className="h-3.5 w-3.5" /> Brand Foundation
        </h2>
        {editing ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                updateSettings({ brand: draft });
                setEditing(false);
                toast.success('Brand foundation updated');
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => {
              setDraft(brand);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tagline" className="md:col-span-2">
            <input className="input" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
          </Field>
          <Field label="Target audience" className="md:col-span-2">
            <AutoTextarea value={draft.audience} onChange={(e) => set('audience', e.target.value)} minRows={2} />
          </Field>
          <Field label="Brand personality" className="md:col-span-2">
            <TagInput value={draft.personality} onChange={(v) => set('personality', v)} />
          </Field>
          <Field label="Tone — do">
            <TagInput value={draft.toneDo} onChange={(v) => set('toneDo', v)} />
          </Field>
          <Field label="Tone — don’t">
            <TagInput value={draft.toneDont} onChange={(v) => set('toneDont', v)} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-[17px] leading-snug font-semibold tracking-tight text-ink">“{brand.tagline}”</p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{brand.audience}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {brand.personality.map((p) => (
                <span key={p} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-brand-ink">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">Do</div>
              <ul className="space-y-1">
                {brand.toneDo.map((t) => (
                  <li key={t} className="flex gap-1.5 text-[12.5px] leading-snug text-ink-2">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-red-700 uppercase">Don’t</div>
              <ul className="space-y-1">
                {brand.toneDont.map((t) => (
                  <li key={t} className="flex gap-1.5 text-[12.5px] leading-snug text-ink-2">
                    <X className="mt-0.5 h-3 w-3 shrink-0 text-red-500" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function StrategyPage() {
  const pillars = useWorkspace((s) => s.pillars);
  const contents = useWorkspace((s) => s.contents);
  const statuses = useWorkspace((s) => s.settings.statuses);
  const addPillar = useWorkspace((s) => s.addPillar);
  const month = useUI((s) => s.month);
  const { insights } = useMonthPlan(month);

  const totalPct = pillars.reduce((s, p) => s + p.recommendedPct, 0);
  const stats = useMemo(
    () =>
      Object.fromEntries(
        pillars.map((p) => {
          const row = insights.pillars.find((r) => r.name === p.name);
          const published = contents.filter((c) => c.contentPillar === p.name && stageOf(c.status, statuses) === 'published' && hasMetrics(c));
          const er = published.length ? published.reduce((s, c) => s + (contentER(c) ?? 0), 0) / published.length : null;
          return [p.id, { month: row?.count ?? 0, monthPct: row?.pct ?? 0, er, total: published.length }];
        }),
      ),
    [pillars, insights, contents, statuses],
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Content Strategy"
        subtitle="The strategic foundation behind every KARDEUCE post — why we create it, and how much of each."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              addPillar();
              toast.success('Pillar added', 'Edit it to set the purpose, KPI and mix.');
            }}
          >
            Add Pillar
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <BrandFoundation />
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Recommended Content Mix</h2>
            {totalPct !== 100 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                <TriangleAlert className="h-3 w-3" /> totals {totalPct}%
              </span>
            )}
          </div>
          <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
            <DonutChart unit="pct" data={pillars.map((p) => ({ name: p.name, value: p.recommendedPct, color: p.color }))} centerValue={`${totalPct}%`} centerLabel="monthly mix" size={168} />
            <div className="w-full flex-1 space-y-2">
              {pillars.map((p) => {
                const actual = stats[p.id]?.monthPct ?? 0;
                return (
                  <div key={p.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
                    <span className="flex-1 font-medium text-ink">{p.name}</span>
                    <span className="font-bold text-ink tabular">{p.recommendedPct}%</span>
                    <span className="w-16 text-right text-[11px] text-ink-4 tabular">now {formatPct(actual, 0)}</span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] leading-snug text-ink-4">“now” = actual share in {monthLabel(month)}. Edit a pillar to change its recommended %.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {pillars.map((p, i) => (
          <PillarCard key={p.id} pillar={p} index={i} stats={stats[p.id] ?? { month: 0, monthPct: 0, er: null, total: 0 }} />
        ))}
      </div>
    </div>
  );
}
