import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Copy,
  ExternalLink,
  Gauge,
  Layers,
  Link2,
  Megaphone,
  MonitorSmartphone,
  Shapes,
  Target,
  Trash,
  UserRound,
  X,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { AutoTextarea } from '@/components/ui/Field';
import { Tooltip } from '@/components/ui/Tooltip';
import { StatusBadge } from '@/components/badges/Badges';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { useHotkey } from '@/hooks/useHotkey';
import { formatLong, monthLabel, monthKeyOf, relativeDay } from '@/lib/date';
import { contentER, hasMetrics, stageOf } from '@/lib/analytics';
import { ContentInsights } from '@/components/insights/ContentInsights';
import { cn, formatPct, isMac, isUrl, normaliseUrl } from '@/lib/utils';
import type { ContentItem } from '@/types';
import {
  OwnerValue,
  PlatformToggle,
  SelectField,
  useObjectiveOptions,
  useOwnerOptions,
  usePillarOptions,
  useStatusOptions,
  useTypeOptions,
} from './Pickers';
import { PillarBadge, TypeBadge } from '@/components/badges/Badges';
import { RichTextArea } from './RichTextArea';
import { CaptionEditor } from './CaptionEditor';
import { ReferenceList } from './ReferenceList';
import { CoverField } from './CoverField';

function Prop({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] items-center gap-2 sm:grid-cols-[150px_1fr]">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <span className="text-ink-4">{icon}</span>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{title}</h3>
        {hint && <span className="text-[11px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function ContentDrawer() {
  const openId = useUI((s) => s.openContentId);
  const openContent = useUI((s) => s.openContent);
  const item = useWorkspace((s) => s.contents.find((c) => c.id === openId));
  const contents = useWorkspace((s) => s.contents);
  const updateContent = useWorkspace((s) => s.updateContent);
  const duplicateContent = useWorkspace((s) => s.duplicateContent);
  const deleteContents = useWorkspace((s) => s.deleteContents);
  const restoreContents = useWorkspace((s) => s.restoreContents);

  const [draft, setDraft] = useState<ContentItem | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  // Synced numbers can land while the drawer is open: follow them unless the team edited metrics here.
  const baselineMetrics = useRef<ContentItem['platformMetrics'] | undefined>(undefined);
  useEffect(() => {
    if (!item) return;
    const before = baselineMetrics.current;
    baselineMetrics.current = item.platformMetrics;
    setDraft((d) => (d && d.id === item.id && JSON.stringify(d.platformMetrics) === JSON.stringify(before) ? { ...d, platformMetrics: item.platformMetrics } : d));
  }, [item?.platformMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDraft(item ? structuredClone(item) : null);
    setShowMetrics((!!item && stageOf(item.status, useWorkspace.getState().settings.statuses) === 'published') || (!!item && hasMetrics(item)));
    baselineMetrics.current = item?.platformMetrics;
    // Only re-sync when switching items, not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, !!item]);

  const dirty = useMemo(() => {
    if (!item || !draft) return false;
    const strip = ({ updatedAt: _u, ...rest }: ContentItem) => {
      void _u;
      return rest;
    };
    return JSON.stringify(strip(item)) !== JSON.stringify(strip(draft));
  }, [item, draft]);

  // Neighbours in date order (same as the default plan sort), for quick navigation.
  const siblings = useMemo(() => {
    if (!item?.publishDate) return [] as ContentItem[];
    const m = monthKeyOf(item.publishDate);
    return contents
      .filter((c) => c.publishDate && monthKeyOf(c.publishDate) === m)
      .sort((a, b) => a.publishDate.localeCompare(b.publishDate) || a.order - b.order);
  }, [contents, item?.publishDate]);
  const idx = siblings.findIndex((c) => c.id === item?.id);

  const statusOptions = useStatusOptions();
  const pillarOptions = usePillarOptions();
  const typeOptions = useTypeOptions();
  const ownerOptions = useOwnerOptions();
  const objectiveOptions = useObjectiveOptions();

  const set = <K extends keyof ContentItem>(key: K, value: ContentItem[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = (silent = false) => {
    if (!draft || !item) return;
    const { id: _id, createdAt: _c, updatedAt: _u, ...patch } = draft;
    void _id;
    void _c;
    void _u;
    updateContent(item.id, patch);
    if (!silent) toast.success('Content updated successfully.');
  };

  const close = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: 'You have edits in this content that haven’t been saved yet.',
        confirmLabel: 'Discard changes',
      });
      if (!ok) return;
    }
    openContent(null);
  };

  const goTo = (target?: ContentItem) => {
    if (!target) return;
    if (dirty) {
      save(true);
      toast.success('Content updated successfully.');
    }
    openContent(target.id);
  };

  useHotkey(
    'mod+s',
    (e) => {
      e.preventDefault();
      save();
    },
    !!openId,
  );

  const remove = async () => {
    if (!item) return;
    const ok = await confirm({
      title: `Delete “${item.title || 'Untitled'}”?`,
      description: 'This removes the content from the plan, calendar and performance reports.',
      confirmLabel: 'Delete content',
    });
    if (!ok) return;
    const removed = deleteContents([item.id]);
    openContent(null);
    toast.success('Content deleted', undefined, { label: 'Undo', onClick: () => restoreContents(removed) });
  };

  const duplicate = () => {
    if (!item) return;
    if (dirty) save(true);
    const copy = duplicateContent(item.id);
    if (copy) {
      toast.success('Content duplicated', `“${copy.title}” added to the plan.`);
      openContent(copy.id);
    }
  };

  return (
    <Drawer open={!!openId && !!draft} onClose={close}>
      {draft && item && (
        <>
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-0.5">
              <Tooltip content="Previous content">
                <button type="button" disabled={idx <= 0} onClick={() => goTo(siblings[idx - 1])} className="rounded-md p-1.5 text-ink-3 hover:bg-muted hover:text-ink disabled:opacity-30">
                  <ChevronUp className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip content="Next content">
                <button
                  type="button"
                  disabled={idx < 0 || idx >= siblings.length - 1}
                  onClick={() => goTo(siblings[idx + 1])}
                  className="rounded-md p-1.5 text-ink-3 hover:bg-muted hover:text-ink disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
              Content Plan <span className="text-ink-4">/</span> {item.publishDate ? monthLabel(monthKeyOf(item.publishDate)) : 'Unscheduled'}
              {idx >= 0 && <span className="text-ink-4"> · {idx + 1} of {siblings.length}</span>}
            </div>
            <span className={cn('hidden items-center gap-1.5 text-[11.5px] sm:inline-flex', dirty ? 'text-amber-700' : 'text-ink-4')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', dirty ? 'bg-amber-500' : 'bg-emerald-500')} />
              {dirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <button type="button" onClick={close} className="rounded-md p-1.5 text-ink-3 hover:bg-muted hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pt-5 pb-10 sm:px-6">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={draft.status} />
              <PillarBadge pillar={draft.contentPillar} />
              <TypeBadge type={draft.contentType} />
            </div>
            <AutoTextarea
              value={draft.title}
              minRows={1}
              onChange={(e) => set('title', e.target.value.replace(/\n/g, ''))}
              placeholder="Judul konten"
              className="!border-0 !bg-transparent !px-0 !py-1 !text-[24px] !leading-tight !font-bold !tracking-tight !ring-0"
            />
            {draft.publishDate && (
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                Posting {formatLong(draft.publishDate)} · <span className="font-medium text-ink-2">{relativeDay(draft.publishDate)}</span>
              </p>
            )}

            <div className="mt-5 space-y-2 rounded-xl border border-line bg-canvas/50 p-3 sm:p-4">
              <Prop icon={<CircleDot className="h-3.5 w-3.5" />} label="Status">
                <SelectField value={draft.status} onChange={(v) => set('status', v)} options={statusOptions} renderValue={(v) => <StatusBadge status={v} />} />
              </Prop>
              <Prop icon={<CalendarDays className="h-3.5 w-3.5" />} label="Date Post">
                <input type="date" className="input" value={draft.publishDate} onChange={(e) => set('publishDate', e.target.value)} />
              </Prop>
              <Prop icon={<MonitorSmartphone className="h-3.5 w-3.5" />} label="Platform">
                <PlatformToggle value={draft.platform} onChange={(v) => set('platform', v)} />
              </Prop>
              <Prop icon={<Shapes className="h-3.5 w-3.5" />} label="Content Type">
                <SelectField value={draft.contentType} onChange={(v) => set('contentType', v)} options={typeOptions} renderValue={(v) => <TypeBadge type={v} />} />
              </Prop>
              <Prop icon={<Layers className="h-3.5 w-3.5" />} label="Content Pillar">
                <SelectField value={draft.contentPillar} onChange={(v) => set('contentPillar', v)} options={pillarOptions} renderValue={(v) => <PillarBadge pillar={v} />} />
              </Prop>
              <Prop icon={<UserRound className="h-3.5 w-3.5" />} label="PIC / Owner">
                <SelectField value={draft.owner} onChange={(v) => set('owner', v)} options={ownerOptions} renderValue={(v) => <OwnerValue id={v} />} placeholder="Assign someone" allowClear />
              </Prop>
              <Prop icon={<Target className="h-3.5 w-3.5" />} label="Objective">
                <SelectField value={draft.objective} onChange={(v) => set('objective', v)} options={objectiveOptions} placeholder="Awareness / Engagement / Education / Conversion" allowClear />
              </Prop>
              <Prop icon={<Gauge className="h-3.5 w-3.5" />} label="KPI">
                <input className="input" value={draft.kpi} onChange={(e) => set('kpi', e.target.value)} placeholder="e.g. Reach, Shares, Comments" />
              </Prop>
              <Prop icon={<Link2 className="h-3.5 w-3.5" />} label="Link Konten">
                <div className="flex gap-1.5">
                  <input className="input" value={draft.contentUrl} onChange={(e) => set('contentUrl', e.target.value)} onBlur={(e) => e.target.value && set('contentUrl', normaliseUrl(e.target.value))} placeholder="Instagram / TikTok post URL" />
                  {isUrl(draft.contentUrl) && (
                    <a href={normaliseUrl(draft.contentUrl)} target="_blank" rel="noreferrer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-ink-2 hover:bg-muted" aria-label="Open content">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </Prop>
            </div>

            <div className="mt-7 space-y-7">
              <Section title="Hook" hint="3 detik pertama">
                <input className="input !h-10 !text-[14px] font-medium" value={draft.hook} onChange={(e) => set('hook', e.target.value)} placeholder="“Alasan mulai tennis versi orang kantoran”" />
              </Section>

              <Section title="Content Brief">
                <RichTextArea value={draft.brief} onChange={(v) => set('brief', v)} placeholder="Konsep, angle, mood, referensi visual, talent, lokasi…" minRows={4} />
              </Section>

              <Section title="Script / Content Structure">
                <RichTextArea
                  value={draft.script}
                  onChange={(v) => set('script', v)}
                  placeholder={'## Scene 1 — Hook\n- Visual: …\n- Text overlay: …\n\n## Scene 2 — Body\n- …'}
                  minRows={6}
                />
              </Section>

              <Section title="Caption">
                <CaptionEditor value={draft.caption} onChange={(v) => set('caption', v)} />
              </Section>

              <Section title="CTA">
                <div className="relative">
                  <Megaphone className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
                  <input className="input !pl-8" value={draft.cta} onChange={(e) => set('cta', e.target.value)} placeholder="“Tag temen lo yang baru keracunan tennis 🎾”" />
                </div>
              </Section>

              <Section title="Reference" hint={`${draft.references.length} link${draft.references.length === 1 ? '' : 's'}`}>
                <ReferenceList value={draft.references} onChange={(v) => set('references', v)} />
              </Section>

              <Section title="Cover">
                <CoverField value={draft.coverImage} onChange={(v) => set('coverImage', v)} />
              </Section>

              <Section title="Notes" hint="Production notes">
                <AutoTextarea value={draft.notes} minRows={3} onChange={(e) => set('notes', e.target.value)} placeholder="Shooting schedule, props, talent, revisi dari review…" />
              </Section>

              <Section
                title="Insights"
                hint={
                  <button type="button" onClick={() => setShowMetrics((s) => !s)} className="font-medium text-ink-3 hover:text-ink">
                    {showMetrics ? 'Hide' : 'Show'} insights
                  </button>
                }
              >
                {showMetrics ? (
                  <ContentInsights draft={draft} onPlatformMetrics={(v) => set('platformMetrics', v)} onLegacyMetrics={(v) => set('metrics', v)} />
                ) : (
                  <p className="text-[12.5px] text-ink-4">
                    {hasMetrics(draft) ? `Engagement rate ${formatPct(contentER(draft) ?? 0, 2)} across platforms.` : 'Numbers appear here after the post is synced, or type them in manually.'}
                  </p>
                )}
              </Section>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/70 px-4 py-3 sm:px-6">
            <Button variant="danger" size="md" icon={<Trash className="h-3.5 w-3.5" />} onClick={remove}>
              <span className="hidden sm:inline">Delete Content</span>
            </Button>
            <Button variant="secondary" icon={<Copy className="h-3.5 w-3.5" />} onClick={duplicate}>
              <span className="hidden sm:inline">Duplicate Content</span>
            </Button>
            <div className="flex-1" />
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(structuredClone(item))}>
                Reset
              </Button>
            )}
            <Button variant="primary" disabled={!dirty} onClick={() => save()}>
              Save Changes
              <span className="ml-1 rounded bg-white/15 px-1 font-mono text-[10px]">{isMac() ? '⌘' : 'Ctrl'} S</span>
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
}
