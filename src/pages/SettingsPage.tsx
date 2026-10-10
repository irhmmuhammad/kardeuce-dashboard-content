import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Database, Download, Keyboard, Pencil, Plus, RotateCcw, Trash, Upload, X } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { navigate } from '@/hooks/useRoute';
import { downloadFile } from '@/lib/csv';
import { cn, isMac, moveItem, uid } from '@/lib/utils';
import { TONES, TONE_KEYS, TEAM_COLORS } from '@/config/theme';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Popover } from '@/components/ui/Popover';
import { StatusBadge, typeIcon } from '@/components/badges/Badges';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import { IntegrationsPanel } from '@/components/insights/IntegrationsPanel';
import { useInsights } from '@/store/insights';
import type { StatusOption, StatusStage, TeamMember, Tone, WorkspaceSnapshot } from '@/types';

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface ListEditorProps {
  items: string[];
  render?: (name: string) => ReactNode;
  usage: (name: string) => number;
  onAdd: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onReorder: (items: string[]) => void;
  placeholder: string;
  extra?: (name: string) => ReactNode;
}

/** Add / rename / reorder / delete for a simple option list. */
function ListEditor({ items, render, usage, onAdd, onRename, onDelete, onReorder, placeholder, extra }: ListEditorProps) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) return toast.error(`“${v}” already exists`);
    onAdd(v);
    setDraft('');
  };
  const commitRename = (from: string) => {
    const v = editValue.trim();
    setEditing(null);
    if (!v || v === from) return;
    if (items.some((i) => i !== from && i.toLowerCase() === v.toLowerCase())) return toast.error(`“${v}” already exists`);
    onRename(from, v);
    const n = usage(from);
    toast.success(`Renamed to “${v}”`, n ? `Updated ${n} item${n === 1 ? '' : 's'}.` : undefined);
  };

  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {items.map((name, i) => (
          <li key={name} className="group flex items-center gap-2 bg-white px-3 py-2 hover:bg-hover">
            {editing === name ? (
              <input
                autoFocus
                className="input !h-8"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(name);
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <>
                <span className="min-w-0 flex-1 text-[13px] text-ink">{render ? render(name) : name}</span>
                {extra?.(name)}
                <span className="text-[11px] text-ink-4 tabular">{usage(name)} used</span>
              </>
            )}
            <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" disabled={i === 0} onClick={() => onReorder(moveItem(items, i, i - 1))} className="rounded p-1 text-ink-3 hover:bg-muted hover:text-ink disabled:opacity-30" aria-label="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={i === items.length - 1} onClick={() => onReorder(moveItem(items, i, i + 1))} className="rounded p-1 text-ink-3 hover:bg-muted hover:text-ink disabled:opacity-30" aria-label="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(name);
                  setEditValue(name);
                }}
                className="rounded p-1 text-ink-3 hover:bg-muted hover:text-ink"
                aria-label="Rename"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  const n = usage(name);
                  const ok = await confirm({
                    title: `Remove “${name}”?`,
                    description: n ? `${n} item${n === 1 ? '' : 's'} still use it — they’ll keep the value but it won’t be selectable anymore.` : 'It isn’t used anywhere.',
                    confirmLabel: 'Remove',
                  });
                  if (ok) onDelete(name);
                }}
                className="rounded p-1 text-ink-3 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input className="input" placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button onClick={add} icon={<Plus className="h-3.5 w-3.5" />} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

function TonePicker({ value, onChange }: { value: Tone; onChange: (t: Tone) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted" aria-label="Change colour">
        <span className={cn('h-3 w-3 rounded-full', TONES[value].dot)} />
      </button>
      <Popover open={open} anchor={ref.current} onClose={() => setOpen(false)} width={164}>
        <div className="grid grid-cols-6 gap-1 p-1">
          {TONE_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={cn('flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted', value === t && 'ring-2 ring-ink')}
              aria-label={t}
            >
              <span className={cn('h-3.5 w-3.5 rounded-full', TONES[t].dot)} />
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

const STAGES: { value: StatusStage; label: string }[] = [
  { value: 'idea', label: 'Ideation' },
  { value: 'progress', label: 'In progress' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
];

function TeamEditor() {
  const team = useWorkspace((s) => s.settings.team);
  const contents = useWorkspace((s) => s.contents);
  const updateSettings = useWorkspace((s) => s.updateSettings);
  const updateContents = useWorkspace((s) => s.updateContents);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const add = () => {
    if (!name.trim()) return;
    const member: TeamMember = { id: uid('t'), name: name.trim(), role: role.trim() || 'Team member', color: TEAM_COLORS[team.length % TEAM_COLORS.length] };
    updateSettings({ team: [...team, member] });
    setName('');
    setRole('');
    toast.success(`${member.name} added to the team`);
  };

  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {team.map((m) => {
          const n = contents.filter((c) => c.owner === m.id).length;
          const isEditing = editing?.id === m.id;
          return (
            <li key={m.id} className="group flex items-center gap-3 bg-white px-3 py-2.5 hover:bg-hover">
              <Avatar member={isEditing ? editing : m} size={30} />
              {isEditing ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input className="input !h-8 w-40 flex-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <input className="input !h-8 w-40 flex-1" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} />
                  <div className="flex gap-1">
                    {TEAM_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setEditing({ ...editing, color: c })} className={cn('h-5 w-5 rounded-full ring-offset-1', editing.color === c && 'ring-2 ring-ink')} style={{ background: c }} aria-label={c} />
                    ))}
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="primary"
                    onClick={() => {
                      updateSettings({ team: team.map((t) => (t.id === m.id ? { ...editing, name: editing.name.trim() || t.name } : t)) });
                      setEditing(null);
                      toast.success('Team member updated');
                    }}
                    aria-label="Save"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink">{m.name}</div>
                    <div className="text-[11.5px] text-ink-3">{m.role}</div>
                  </div>
                  <span className="text-[11px] text-ink-4 tabular">{n} content</span>
                  <div className="flex opacity-0 group-hover:opacity-100">
                    <button type="button" onClick={() => setEditing(m)} className="rounded p-1 text-ink-3 hover:bg-muted hover:text-ink" aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Remove ${m.name}?`,
                          description: n ? `${n} content item${n === 1 ? ' is' : 's are'} assigned to ${m.name.split(' ')[0]} and will become unassigned.` : undefined,
                          confirmLabel: 'Remove',
                        });
                        if (!ok) return;
                        const ids = contents.filter((c) => c.owner === m.id).map((c) => c.id);
                        if (ids.length) updateContents(ids, { owner: '' });
                        updateSettings({ team: team.filter((t) => t.id !== m.id) });
                        toast.success(`${m.name} removed`);
                      }}
                      className="rounded p-1 text-ink-3 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="input min-w-[140px] flex-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <input className="input min-w-[140px] flex-1" placeholder="Role (e.g. Videographer)" value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button onClick={add} icon={<Plus className="h-3.5 w-3.5" />} disabled={!name.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useWorkspace((s) => s.settings);
  const contents = useWorkspace((s) => s.contents);
  const ideas = useWorkspace((s) => s.ideas);
  const pillars = useWorkspace((s) => s.pillars);
  const updateSettings = useWorkspace((s) => s.updateSettings);
  const renameOption = useWorkspace((s) => s.renameOption);
  const resetWorkspace = useWorkspace((s) => s.resetWorkspace);
  const replaceWorkspace = useWorkspace((s) => s.replaceWorkspace);
  const exportSnapshot = useWorkspace((s) => s.exportSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);

  const storageKb = useMemo(() => {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (k.startsWith('kardeuce')) bytes += (localStorage.getItem(k)?.length ?? 0) * 2;
    }
    return bytes / 1024;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contents, ideas, settings, pillars]);

  const updateStatus = (name: string, patch: Partial<StatusOption>) => updateSettings({ statuses: settings.statuses.map((s) => (s.name === name ? { ...s, ...patch } : s)) });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newStatus, setNewStatus] = useState('');

  const commitStatusRename = (from: string) => {
    const v = renameValue.trim();
    setRenaming(null);
    if (!v || v === from) return;
    if (settings.statuses.some((x) => x.name.toLowerCase() === v.toLowerCase())) return toast.error(`“${v}” already exists`);
    renameOption('status', from, v);
    toast.success(`Renamed to “${v}”`);
  };

  const addStatus = () => {
    const name = newStatus.trim();
    if (!name) return;
    if (settings.statuses.some((x) => x.name.toLowerCase() === name.toLowerCase())) return toast.error(`“${name}” already exists`);
    // New statuses slot in before "Scheduled" as an in-progress stage.
    const scheduledIdx = settings.statuses.findIndex((x) => x.stage === 'scheduled');
    const next = settings.statuses.slice();
    next.splice(scheduledIdx >= 0 ? scheduledIdx : next.length, 0, { name, tone: 'teal', stage: 'progress' });
    updateSettings({ statuses: next });
    setNewStatus('');
    toast.success(`Status “${name}” added`);
  };

  const mod = isMac() ? '⌘' : 'Ctrl';
  const shortcuts: [string, string][] = [
    ['N', 'New content (quick add)'],
    ['/', 'Focus search'],
    ['↑ ↓ ← →', 'Move between cells'],
    ['Enter', 'Edit cell / open dropdown'],
    ['Esc', 'Cancel edit / close'],
    ['Tab', 'Next cell'],
    ['⇧ Enter', 'Open content details'],
    [`${mod} S`, 'Save'],
    [`${mod} D`, 'Duplicate row'],
    ['Space', 'Select row'],
    ['Delete', 'Clear cell'],
  ];

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" subtitle="Options used across the plan, calendar and reports. Renaming an option updates every content that uses it." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Platforms" description="Where KARDEUCE publishes.">
          <ListEditor
            items={settings.platforms}
            render={(p) => (
              <span className="inline-flex items-center gap-2">
                <PlatformIcon platform={p} /> {p}
              </span>
            )}
            usage={(n) => contents.filter((c) => c.platform.includes(n)).length}
            onAdd={(n) => updateSettings({ platforms: [...settings.platforms, n] })}
            onRename={(a, b) => renameOption('platform', a, b)}
            onDelete={(n) => updateSettings({ platforms: settings.platforms.filter((x) => x !== n) })}
            onReorder={(items) => updateSettings({ platforms: items })}
            placeholder="Add platform (e.g. YouTube Shorts)"
          />
        </Section>

        <Section title="Content Types" description="Formats available in the plan.">
          <ListEditor
            items={settings.contentTypes}
            render={(t) => {
              const Icon = typeIcon(t);
              return (
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-ink-3" /> {t}
                </span>
              );
            }}
            usage={(n) => contents.filter((c) => c.contentType === n).length + ideas.filter((i) => i.contentType === n).length}
            onAdd={(n) => updateSettings({ contentTypes: [...settings.contentTypes, n] })}
            onRename={(a, b) => renameOption('contentType', a, b)}
            onDelete={(n) => updateSettings({ contentTypes: settings.contentTypes.filter((x) => x !== n) })}
            onReorder={(items) => updateSettings({ contentTypes: items })}
            placeholder="Add content type (e.g. Live)"
          />
        </Section>

        <Section
          title="Content Pillars"
          description="Name, purpose, KPI and recommended mix live in Content Strategy."
          action={
            <Button size="sm" onClick={() => navigate('strategy')}>
              Edit in Strategy
            </Button>
          }
        >
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {pillars.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="h-3 w-3 rounded-[4px]" style={{ background: p.color }} />
                <span className="flex-1 text-[13px] font-medium text-ink">{p.name}</span>
                <span className="text-[12px] text-ink-3 tabular">{p.recommendedPct}%</span>
                <span className="w-16 text-right text-[11px] text-ink-4 tabular">{contents.filter((c) => c.contentPillar === p.name).length} used</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Content Status" description="Workflow stages. Colour and stage drive badges, Kanban and dashboard counts.">
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {settings.statuses.map((s, i) => (
              <li key={s.name} className="group flex items-center gap-2 bg-white px-2.5 py-1.5 hover:bg-hover">
                <TonePicker value={s.tone} onChange={(tone) => updateStatus(s.name, { tone })} />
                <span className="min-w-0 flex-1">
                  {renaming === s.name ? (
                    <input
                      autoFocus
                      className="input !h-7"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitStatusRename(s.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitStatusRename(s.name);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <StatusBadge status={s.name} />
                  )}
                </span>
                <select
                  value={s.stage}
                  onChange={(e) => updateStatus(s.name, { stage: e.target.value as StatusStage })}
                  className="h-7 rounded-md border border-line bg-white px-1.5 text-[12px] text-ink-2 outline-none"
                  aria-label="Stage"
                >
                  {STAGES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
                <span className="w-12 text-right text-[11px] text-ink-4 tabular">{contents.filter((c) => c.status === s.name).length} used</span>
                <div className="flex opacity-0 group-hover:opacity-100">
                  <button type="button" disabled={i === 0} onClick={() => updateSettings({ statuses: moveItem(settings.statuses, i, i - 1) })} className="rounded p-1 text-ink-3 hover:bg-muted disabled:opacity-30" aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === settings.statuses.length - 1}
                    onClick={() => updateSettings({ statuses: moveItem(settings.statuses, i, i + 1) })}
                    className="rounded p-1 text-ink-3 hover:bg-muted disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(s.name);
                      setRenameValue(s.name);
                    }}
                    className="rounded p-1 text-ink-3 hover:bg-muted"
                    aria-label="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={settings.statuses.length <= 1}
                    onClick={async () => {
                      const n = contents.filter((c) => c.status === s.name).length;
                      const ok = await confirm({ title: `Remove “${s.name}”?`, description: n ? `${n} content item${n === 1 ? '' : 's'} still use this status.` : undefined, confirmLabel: 'Remove' });
                      if (ok) updateSettings({ statuses: settings.statuses.filter((x) => x.name !== s.name) });
                    }}
                    className="rounded p-1 text-ink-3 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label="Remove"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              placeholder="Add status (e.g. Revision)"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStatus()}
            />
            <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={addStatus} disabled={!newStatus.trim()}>
              Add
            </Button>
          </div>
        </Section>

        <Section title="Team / PIC" description="People who can own content.">
          <TeamEditor />
        </Section>

        <Section title="Objectives & Idea Status" description="Options for the Objective field and the Content Bank.">
          <div className="space-y-4">
            <ListEditor
              items={settings.objectives}
              usage={(n) => contents.filter((c) => c.objective === n).length}
              onAdd={(n) => updateSettings({ objectives: [...settings.objectives, n] })}
              onRename={(a, b) => renameOption('objective', a, b)}
              onDelete={(n) => updateSettings({ objectives: settings.objectives.filter((x) => x !== n) })}
              onReorder={(items) => updateSettings({ objectives: items })}
              placeholder="Add objective"
            />
            <ListEditor
              items={settings.ideaStatuses}
              usage={(n) => ideas.filter((i) => i.status === n).length}
              onAdd={(n) => updateSettings({ ideaStatuses: [...settings.ideaStatuses.slice(0, -1), n, ...settings.ideaStatuses.slice(-1)] })}
              onRename={(a, b) => renameOption('ideaStatus', a, b)}
              onDelete={(n) => updateSettings({ ideaStatuses: settings.ideaStatuses.filter((x) => x !== n) })}
              onReorder={(items) => updateSettings({ ideaStatuses: items })}
              placeholder="Add idea status"
            />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section title="Data & Backup" description="Everything is stored in this browser (localStorage).">
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-[12px] text-ink-2">
            <Database className="h-3.5 w-3.5 text-ink-3" />
            {contents.length} content · {ideas.length} ideas · {storageKb.toFixed(0)} KB used
          </div>
          <div className="flex flex-col gap-2">
            <Button
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => {
                downloadFile(`kardeuce-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...exportSnapshot(), accountSnapshots: useInsights.getState().snapshots, platformPosts: useInsights.getState().posts }, null, 2), 'application/json');
                toast.success('Backup downloaded');
              }}
            >
              Export backup (.json)
            </Button>
            <Button icon={<Upload className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
              Restore from backup
            </Button>
            <Button
              variant="danger"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={async () => {
                const ok = await confirm({ title: 'Reset to sample data?', description: 'This replaces all content, ideas, pillars and settings with the original KARDEUCE sample workspace.', confirmLabel: 'Reset workspace' });
                if (ok) {
                  resetWorkspace();
                  toast.success('Workspace reset to sample data');
                }
              }}
            >
              Reset to sample data
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const data = JSON.parse(await file.text()) as WorkspaceSnapshot;
                if (!Array.isArray(data.contents) || !data.settings) throw new Error('Not a KARDEUCE backup file');
                const ok = await confirm({ title: 'Restore this backup?', description: `${data.contents.length} content and ${data.ideas?.length ?? 0} ideas will replace the current workspace.`, confirmLabel: 'Restore' });
                if (!ok) return;
                replaceWorkspace({ ...data, ideas: data.ideas ?? [], pillars: data.pillars ?? pillars });
                if (data.accountSnapshots || data.platformPosts) useInsights.getState().replaceData(data.accountSnapshots ?? [], data.platformPosts ?? []);
                toast.success('Backup restored');
              } catch (err) {
                toast.error('Could not restore backup', err instanceof Error ? err.message : undefined);
              }
            }}
          />
        </Section>

        <Section title="Integrations" description="Instagram & TikTok insights. Demo data is shown until an account is connected.">
          <IntegrationsPanel />
        </Section>

        <Section title="Keyboard Shortcuts" description="Built for spreadsheet speed.">
          <ul className="space-y-1.5">
            {shortcuts.map(([k, label]) => (
              <li key={label} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-ink-2">{label}</span>
                <span className="flex gap-1">
                  {k.split(' ').map((part) => (
                    <span key={part} className="kbd">
                      {part}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-4">
            <Keyboard className="h-3.5 w-3.5" /> Right-click a row for more actions.
          </div>
        </Section>
      </div>
    </div>
  );
}
