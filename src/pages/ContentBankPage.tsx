import { useMemo, useState } from 'react';
import { CalendarPlus, CircleCheck, ExternalLink, Flame, LayoutGrid, Lightbulb, Pencil, Plus, Rows3, Trash, TrendingUp, Ellipsis } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { navigate } from '@/hooks/useRoute';
import { formatShort, monthKeyOf } from '@/lib/date';
import { cn, hostname } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { PillarBadge, PriorityBadge, TypeBadge } from '@/components/badges/Badges';
import { FilterChip, SearchInput } from '@/components/content/FilterBar';
import { usePillarOptions, useTypeOptions } from '@/components/content/Pickers';
import { LinkSourceIcon } from '@/components/content/ReferenceList';
import { IdeaModal } from '@/components/bank/IdeaModal';
import { MoveToPlanModal } from '@/components/bank/MoveToPlanModal';
import type { Idea } from '@/types';

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 } as const;

export function ContentBankPage() {
  const ideas = useWorkspace((s) => s.ideas);
  const contents = useWorkspace((s) => s.contents);
  const pillars = useWorkspace((s) => s.pillars);
  const ideaStatuses = useWorkspace((s) => s.settings.ideaStatuses);
  const deleteIdeas = useWorkspace((s) => s.deleteIdeas);
  const restoreIdeas = useWorkspace((s) => s.restoreIdeas);
  const updateIdea = useWorkspace((s) => s.updateIdea);
  const view = useUI((s) => s.bankView);
  const setView = useUI((s) => s.setBankView);
  const openContent = useUI((s) => s.openContent);
  const setMonth = useUI((s) => s.setMonth);
  const pillarOptions = usePillarOptions();
  const typeOptions = useTypeOptions();

  const [search, setSearch] = useState('');
  const [fPillars, setFPillars] = useState<string[]>([]);
  const [fTypes, setFTypes] = useState<string[]>([]);
  const [fPriority, setFPriority] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [showMoved, setShowMoved] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [moving, setMoving] = useState<Idea | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ideas
      .filter((i) => showMoved || !i.movedToContentId)
      .filter((i) => !fPillars.length || fPillars.includes(i.contentPillar))
      .filter((i) => !fTypes.length || fTypes.includes(i.contentType))
      .filter((i) => !fPriority.length || fPriority.includes(i.priority))
      .filter((i) => !fStatus.length || fStatus.includes(i.status))
      .filter((i) => !q || `${i.idea} ${i.description} ${i.hook} ${i.trend}`.toLowerCase().includes(q))
      .sort((a, b) => Number(!!a.movedToContentId) - Number(!!b.movedToContentId) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt.localeCompare(a.createdAt));
  }, [ideas, search, fPillars, fTypes, fPriority, fStatus, showMoved]);

  const open = ideas.filter((i) => !i.movedToContentId);
  const moved = ideas.length - open.length;
  const hasFilters = !!search || fPillars.length + fTypes.length + fPriority.length + fStatus.length > 0;

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (idea: Idea) => {
    setEditing(idea);
    setModalOpen(true);
  };
  const remove = async (idea: Idea) => {
    const ok = await confirm({ title: `Delete idea “${idea.idea}”?`, description: 'It will be removed from the Content Bank.', confirmLabel: 'Delete idea' });
    if (!ok) return;
    const removed = deleteIdeas([idea.id]);
    toast.success('Idea deleted', undefined, { label: 'Undo', onClick: () => restoreIdeas(removed) });
  };
  const viewInPlan = (idea: Idea) => {
    const c = contents.find((x) => x.id === idea.movedToContentId);
    if (!c) return;
    if (c.publishDate) setMonth(monthKeyOf(c.publishDate));
    navigate('plan');
    openContent(c.id);
  };

  const actions = (idea: Idea) => (
    <Menu
      width={190}
      trigger={({ ref, onClick }) => (
        <Button ref={ref} size="icon-sm" variant="ghost" onClick={onClick} aria-label="Idea actions">
          <Ellipsis className="h-4 w-4" />
        </Button>
      )}
      items={[
        { label: 'Edit idea', icon: <Pencil className="h-3.5 w-3.5" />, onSelect: () => openEdit(idea) },
        ...ideaStatuses
          .filter((s) => s !== idea.status && s !== ideaStatuses.at(-1))
          .map((s) => ({ label: `Mark as ${s}`, icon: <CircleCheck className="h-3.5 w-3.5" />, onSelect: () => updateIdea(idea.id, { status: s }) })),
        { label: 'Delete', icon: <Trash className="h-3.5 w-3.5" />, danger: true, divider: true, onSelect: () => remove(idea) },
      ]}
    />
  );

  const moveButton = (idea: Idea, size: 'xs' | 'sm' = 'sm') => {
    const c = idea.movedToContentId ? contents.find((x) => x.id === idea.movedToContentId) : undefined;
    return c ? (
      <Button size={size} variant="subtle" icon={<CircleCheck className="h-3.5 w-3.5 text-emerald-600" />} onClick={() => viewInPlan(idea)}>
        In plan · {c.publishDate ? formatShort(c.publishDate) : 'no date'}
      </Button>
    ) : (
      <Button size={size} variant="brand" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setMoving(idea)}>
        Move to Content Plan
      </Button>
    );
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Content Bank"
        subtitle="Ideas that haven’t been scheduled yet. Capture fast, move to the plan when they’re ready."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'cards', label: 'Cards', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                { value: 'table', label: 'Table', icon: <Rows3 className="h-3.5 w-3.5" /> },
              ]}
            />
            <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />} onClick={openAdd}>
              Add Idea
            </Button>
          </>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <div className="text-[12px] text-ink-3">Open ideas</div>
          <div className="mt-1 text-[24px] font-bold text-ink tabular">{open.length}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1 text-[12px] text-ink-3">
            <Flame className="h-3.5 w-3.5 text-red-500" /> High priority
          </div>
          <div className="mt-1 text-[24px] font-bold text-ink tabular">{open.filter((i) => i.priority === 'High').length}</div>
        </div>
        <div className="card p-4">
          <div className="text-[12px] text-ink-3">Moved to plan</div>
          <div className="mt-1 text-[24px] font-bold text-ink tabular">{moved}</div>
        </div>
        <div className="card p-4">
          <div className="mb-2 text-[12px] text-ink-3">By pillar</div>
          <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-muted">
            {pillars.map((p) => {
              const n = open.filter((i) => i.contentPillar === p.name).length;
              return n ? <div key={p.id} style={{ width: `${(n / Math.max(1, open.length)) * 100}%`, background: p.color }} title={`${p.name}: ${n}`} /> : null;
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5">
            {pillars.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                {open.filter((i) => i.contentPillar === p.name).length}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search ideas, hooks, trends…" className="w-full sm:w-64" />
        <FilterChip label="Pillar" options={pillarOptions} value={fPillars} onChange={setFPillars} />
        <FilterChip label="Type" options={typeOptions} value={fTypes} onChange={setFTypes} />
        <FilterChip label="Priority" options={(['High', 'Medium', 'Low'] as const).map((p) => ({ value: p, label: p, render: <PriorityBadge priority={p} /> }))} value={fPriority} onChange={setFPriority} />
        <FilterChip label="Status" options={ideaStatuses.map((s) => ({ value: s, label: s }))} value={fStatus} onChange={setFStatus} />
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2 select-none">
          <input type="checkbox" checked={showMoved} onChange={(e) => setShowMoved(e.target.checked)} className="accent-[#17211a]" />
          Show moved ideas
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Lightbulb className="h-5 w-5" />}
            title={hasFilters ? 'No ideas match your filters' : 'Your idea bank is empty'}
            description={hasFilters ? 'Try a different search or clear the filters.' : 'Save trends, hooks and references here so nothing gets lost between planning sessions.'}
            action={
              hasFilters ? (
                <Button
                  onClick={() => {
                    setSearch('');
                    setFPillars([]);
                    setFTypes([]);
                    setFPriority([]);
                    setFStatus([]);
                  }}
                >
                  Clear Filters
                </Button>
              ) : (
                <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={openAdd}>
                  Add Idea
                </Button>
              )
            }
          />
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((idea) => (
            <article key={idea.id} className={cn('card flex flex-col p-4 transition-colors hover:border-line-strong', idea.movedToContentId && 'opacity-70')}>
              <div className="flex items-center gap-1.5">
                <PriorityBadge priority={idea.priority} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-ink-2">{idea.status}</span>
                <span className="ml-auto">{actions(idea)}</span>
              </div>
              <button type="button" onClick={() => openEdit(idea)} className="mt-2 text-left text-[15px] leading-snug font-semibold text-ink hover:underline">
                {idea.idea}
              </button>
              {idea.description && <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-ink-3">{idea.description}</p>}
              {idea.hook && (
                <div className="mt-3 rounded-lg border-l-2 border-brand-strong bg-brand-soft/60 px-3 py-2 text-[12.5px] font-medium text-ink italic">“{idea.hook}”</div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <PillarBadge pillar={idea.contentPillar} />
                <TypeBadge type={idea.contentType} />
                {idea.trend && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] font-medium text-ink-2">
                    <TrendingUp className="h-3 w-3" /> {idea.trend}
                  </span>
                )}
              </div>
              <div className="flex-1" />
              <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                {idea.reference ? (
                  <a href={idea.reference} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink">
                    <LinkSourceIcon url={idea.reference} />
                    <span className="truncate">{hostname(idea.reference)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-[12px] text-ink-4">No reference</span>
                )}
                <span className="ml-auto">{moveButton(idea, 'xs')}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-[#f3f5f0] text-[12px] font-semibold text-ink">
              <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3 [&>th]:py-2.5">
                <th className="w-[260px]">Idea</th>
                <th>Content Pillar</th>
                <th>Content Type</th>
                <th className="w-[240px]">Description</th>
                <th className="w-[200px]">Hook</th>
                <th>Reference</th>
                <th>Trend</th>
                <th>Priority</th>
                <th>Status</th>
                <th className="w-[200px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((idea) => (
                <tr key={idea.id} className={cn('group text-[12.5px] hover:bg-hover [&>td]:border-b [&>td]:border-line [&>td]:px-3 [&>td]:py-2', idea.movedToContentId && 'opacity-70')}>
                  <td>
                    <button type="button" onClick={() => openEdit(idea)} className="text-left font-semibold text-ink hover:underline">
                      {idea.idea}
                    </button>
                  </td>
                  <td>
                    <PillarBadge pillar={idea.contentPillar} />
                  </td>
                  <td>
                    <TypeBadge type={idea.contentType} />
                  </td>
                  <td className="text-ink-3">
                    <span className="line-clamp-2">{idea.description || '—'}</span>
                  </td>
                  <td className="text-ink-2 italic">
                    <span className="line-clamp-2">{idea.hook ? `“${idea.hook}”` : '—'}</span>
                  </td>
                  <td>
                    {idea.reference ? (
                      <a href={idea.reference} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium text-ink hover:bg-brand-soft">
                        <LinkSourceIcon url={idea.reference} className="h-3 w-3" /> Open Ref ↗
                      </a>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </td>
                  <td className="text-ink-2">{idea.trend || <span className="text-ink-4">—</span>}</td>
                  <td>
                    <PriorityBadge priority={idea.priority} />
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{idea.status}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {moveButton(idea, 'xs')}
                      {actions(idea)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IdeaModal open={modalOpen} idea={editing} onClose={() => setModalOpen(false)} />
      <MoveToPlanModal idea={moving} onClose={() => setMoving(null)} />
    </div>
  );
}
