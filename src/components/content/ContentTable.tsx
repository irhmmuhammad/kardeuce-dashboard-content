import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Copy,
  Ellipsis,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Maximize2,
  MoveDown,
  MoveUp,
  PanelRightOpen,
  Plus,
  Trash,
} from 'lucide-react';
import type { ColumnKey, ContentItem, MonthKey } from '@/types';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { cn, formatPct, isUrl, moveItem, normaliseUrl, stripMarkdown } from '@/lib/utils';
import { addDays, formatSheet, monthKeyOf, todayISO, weekdayShort } from '@/lib/date';
import { contentER, stageOf } from '@/lib/analytics';
import { fileToCoverDataUrl } from '@/lib/image';
import { hasOpenLayer } from '@/lib/layers';
import { Checkbox } from '@/components/ui/Checkbox';
import { Popover } from '@/components/ui/Popover';
import { OptionList, type Option } from '@/components/ui/OptionList';
import { Tooltip } from '@/components/ui/Tooltip';
import { Avatar } from '@/components/ui/Avatar';
import { PillarBadge, StatusBadge, TypeBadge } from '@/components/badges/Badges';
import { PlatformIcon, PlatformIcons } from '@/components/badges/PlatformIcon';
import { COLUMN_MAP, COLUMNS, type ColumnDef } from './columns';
import { CellInput, type CommitReason } from './cells/CellEditors';
import { TextEditorModal, type LongTextField } from './TextEditorModal';
import { BulkActionBar } from './BulkActionBar';
import { useObjectiveOptions, useOwnerOptions, usePillarOptions, useStatusOptions, useTypeOptions } from './Pickers';
import { LinkSourceIcon } from './ReferenceList';

interface ContentTableProps {
  items: ContentItem[];
  month: MonthKey;
}

type CellPos = { rowId: string; col: ColumnKey };

const PRINTABLE = /^.$/u;

export function ContentTable({ items, month }: ContentTableProps) {
  const visibleColumns = useUI((s) => s.visibleColumns);
  const freezeUntil = useUI((s) => s.freezeUntil);
  const density = useUI((s) => s.rowDensity);
  const sort = useUI((s) => s.sort);
  const setSort = useUI((s) => s.setSort);
  const openContent = useUI((s) => s.openContent);
  const openLightbox = useUI((s) => s.openLightbox);

  const statuses = useWorkspace((s) => s.settings.statuses);
  const platforms = useWorkspace((s) => s.settings.platforms);
  const team = useWorkspace((s) => s.settings.team);
  const updateContent = useWorkspace((s) => s.updateContent);
  const addContent = useWorkspace((s) => s.addContent);
  const reorderContents = useWorkspace((s) => s.reorderContents);
  const duplicateContent = useWorkspace((s) => s.duplicateContent);
  const deleteContents = useWorkspace((s) => s.deleteContents);
  const restoreContents = useWorkspace((s) => s.restoreContents);

  const statusOptions = useStatusOptions();
  const pillarOptions = usePillarOptions();
  const typeOptions = useTypeOptions();
  const ownerOptions = useOwnerOptions();
  const objectiveOptions = useObjectiveOptions();

  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverTarget = useRef<string | null>(null);
  const ctxAnchorRef = useRef<HTMLDivElement>(null);

  const [active, setActive] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState<(CellPos & { seed?: string }) | null>(null);
  const [popover, setPopover] = useState<CellPos | null>(null);
  const [textModal, setTextModal] = useState<{ rowId: string; field: LongTextField } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorRow, setAnchorRow] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ rowId: string; x: number; y: number } | null>(null);
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);

  const columns = useMemo(() => COLUMNS.filter((c) => c.locked || visibleColumns.includes(c.key)), [visibleColumns]);
  const colKeys = columns.map((c) => c.key);
  const rowIds = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const today = todayISO();
  const rowH = density === 'compact' ? 'h-9' : 'h-12';

  // Frozen columns: everything up to and including `freezeUntil`.
  const frozen = useMemo(() => {
    const out = new Map<ColumnKey, number>();
    if (freezeUntil === 'none') return out;
    const until = colKeys.indexOf(freezeUntil);
    let left = 0;
    columns.forEach((c, i) => {
      if (i <= until) {
        out.set(c.key, left);
        left += c.width;
      }
    });
    return out;
  }, [columns, colKeys, freezeUntil]);
  const lastFrozen = Array.from(frozen.keys()).pop();
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);

  // Drop selection entries that are no longer visible.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => byId.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [byId]);

  // Start editing a freshly inserted row once it renders.
  useEffect(() => {
    if (pendingEdit && byId.has(pendingEdit)) {
      setActive({ rowId: pendingEdit, col: 'title' });
      setEditing({ rowId: pendingEdit, col: 'title' });
      setPendingEdit(null);
      requestAnimationFrame(() => cellEl(pendingEdit, 'title')?.scrollIntoView({ block: 'nearest' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEdit, byId]);

  const cellEl = useCallback(
    (rowId: string, col: ColumnKey) => containerRef.current?.querySelector<HTMLElement>(`[data-cell="${rowId}|${col}"]`) ?? null,
    [],
  );

  const focusGrid = () => containerRef.current?.focus({ preventScroll: true });

  const commit = (rowId: string, patch: Partial<ContentItem>, announce = false) => {
    updateContent(rowId, patch);
    if (announce) toast.success('Content updated successfully.');
  };

  const move = (pos: CellPos, dRow: number, dCol: number): CellPos | null => {
    const r = rowIds.indexOf(pos.rowId) + dRow;
    const c = colKeys.indexOf(pos.col) + dCol;
    if (r < 0 || r >= rowIds.length || c < 0 || c >= colKeys.length) return null;
    return { rowId: rowIds[r], col: colKeys[c] };
  };

  const activate = (pos: CellPos | null) => {
    setActive(pos);
    if (pos) requestAnimationFrame(() => cellEl(pos.rowId, pos.col)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  };

  /** Enter / double-click behaviour per column type. */
  const startEdit = (pos: CellPos, seed?: string) => {
    const col = COLUMN_MAP[pos.col];
    const item = byId.get(pos.rowId);
    if (!item) return;
    setActive(pos);
    switch (col.editor) {
      case 'text':
      case 'date':
      case 'url':
      case 'reference':
        setEditing({ ...pos, seed });
        break;
      case 'select':
      case 'platform':
      case 'owner':
        setPopover(pos);
        break;
      case 'longtext':
        setTextModal({ rowId: pos.rowId, field: col.key as LongTextField });
        break;
      case 'cover':
        if (item.coverImage) openLightbox(item.coverImage);
        else pickCover(pos.rowId);
        break;
      case 'none':
        openContent(pos.rowId);
        break;
    }
  };

  const pickCover = (rowId: string) => {
    coverTarget.current = rowId;
    fileRef.current?.click();
  };

  const onCellCommit = (pos: CellPos, raw: string, reason: CommitReason) => {
    const item = byId.get(pos.rowId);
    setEditing(null);
    if (!item) return;
    const value = raw.trim();
    const col = COLUMN_MAP[pos.col];
    let patch: Partial<ContentItem> | null = null;
    if (col.editor === 'reference') {
      const url = value ? normaliseUrl(value) : '';
      const refs = [...item.references];
      if (url) refs[0] = url;
      else refs.shift();
      if (JSON.stringify(refs) !== JSON.stringify(item.references)) patch = { references: refs };
    } else if (col.editor === 'url') {
      const url = value ? normaliseUrl(value) : '';
      if (url !== item.contentUrl) patch = { contentUrl: url };
    } else if (col.field) {
      if (col.key === 'title' && !value) {
        /* never blank out a title */
      } else if (String(item[col.field] ?? '') !== value) patch = { [col.field]: value } as Partial<ContentItem>;
    }
    if (patch) commit(pos.rowId, patch, reason === 'save');
    else if (reason === 'save') toast.success('Content updated successfully.');

    const next = reason === 'enter' ? move(pos, 1, 0) : reason === 'tab' ? move(pos, 0, 1) : reason === 'shift-tab' ? move(pos, 0, -1) : null;
    if (reason !== 'blur') {
      activate(next ?? pos);
      focusGrid();
    }
  };

  const clearCell = (pos: CellPos) => {
    const col = COLUMN_MAP[pos.col];
    const patch: Partial<ContentItem> | null =
      col.editor === 'reference'
        ? { references: [] }
        : col.editor === 'cover'
          ? { coverImage: '' }
          : col.editor === 'platform'
            ? { platform: [] }
            : col.key === 'owner' || col.key === 'objective' || col.editor === 'longtext' || col.editor === 'url' || col.key === 'kpi'
              ? ({ [col.field as string]: '' } as Partial<ContentItem>)
              : null;
    if (patch) commit(pos.rowId, patch);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing || popover || textModal || hasOpenLayer()) return;
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (!active) {
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key) && rowIds.length) {
        e.preventDefault();
        activate({ rowId: rowIds[0], col: 'title' });
      }
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const go = (dr: number, dc: number) => {
      e.preventDefault();
      const n = move(active, dr, dc);
      if (n) activate(n);
    };
    switch (e.key) {
      case 'ArrowDown':
        return go(1, 0);
      case 'ArrowUp':
        return go(-1, 0);
      case 'ArrowLeft':
        return go(0, -1);
      case 'ArrowRight':
        return go(0, 1);
      case 'Tab':
        return go(0, e.shiftKey ? -1 : 1);
      case 'Enter':
        e.preventDefault();
        if (mod || e.shiftKey) openContent(active.rowId);
        else startEdit(active);
        return;
      case 'Escape':
        e.preventDefault();
        setActive(null);
        return;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        clearCell(active);
        return;
      case ' ':
        e.preventDefault();
        toggleRow(active.rowId, !selected.has(active.rowId));
        return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const copy = duplicateContent(active.rowId);
      if (copy) toast.success('Content duplicated');
      return;
    }
    // Typing on a text cell starts editing with that character (spreadsheet style).
    const col = COLUMN_MAP[active.col];
    if (!mod && !e.altKey && PRINTABLE.test(e.key) && (col.editor === 'text' || col.editor === 'url' || col.editor === 'reference')) {
      e.preventDefault();
      setEditing({ ...active, seed: e.key });
    }
  };

  /* ---------------- Selection ---------------- */

  const toggleRow = (id: string, on: boolean, shift = false) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && anchorRow) {
        const a = rowIds.indexOf(anchorRow);
        const b = rowIds.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        rowIds.slice(lo, hi + 1).forEach((rid) => (on ? next.add(rid) : next.delete(rid)));
      } else if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setAnchorRow(id);
  };

  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = !allSelected && rowIds.some((id) => selected.has(id));

  /* ---------------- Reordering ---------------- */

  const applyOrder = (ids: string[]) => {
    reorderContents(ids);
    if (sort.key !== 'manual') {
      setSort('manual', 'asc');
      toast.info('Switched to manual order', 'Rows now follow your custom order. Change it anytime from Sort.');
    }
  };

  const moveRow = (id: string, delta: number) => {
    const from = rowIds.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rowIds.length) return;
    applyOrder(moveItem(rowIds, from, to));
  };

  const onDropRow = (targetId: string, pos: 'before' | 'after') => {
    if (!dragId || dragId === targetId) return;
    const from = rowIds.indexOf(dragId);
    let to = rowIds.indexOf(targetId) + (pos === 'after' ? 1 : 0);
    if (from < to) to -= 1;
    if (from === to) return;
    applyOrder(moveItem(rowIds, from, to));
  };

  /* ---------------- Row actions ---------------- */

  const deleteRows = async (ids: string[]) => {
    const names = ids.map((id) => byId.get(id)?.title || 'Untitled');
    const ok = await confirm({
      title: ids.length === 1 ? `Delete “${names[0]}”?` : `Delete ${ids.length} content items?`,
      description: 'They’ll be removed from the plan, calendar and reports. You can undo right after.',
      confirmLabel: ids.length === 1 ? 'Delete content' : `Delete ${ids.length} items`,
    });
    if (!ok) return;
    const removed = deleteContents(ids);
    setSelected(new Set());
    setActive(null);
    toast.success(ids.length === 1 ? 'Content deleted' : `${ids.length} items deleted`, undefined, {
      label: 'Undo',
      onClick: () => restoreContents(removed),
    });
  };

  const addInline = () => {
    const monthDates = items.map((i) => i.publishDate).filter((d) => d && monthKeyOf(d) === month).sort();
    const last = monthDates.at(-1);
    let date = last ? addDays(last, 2) : monthKeyOf(today) === month ? today : `${month}-01`;
    if (monthKeyOf(date) !== month) date = last ?? `${month}-01`;
    const item = addContent({
      title: '',
      publishDate: date,
      platform: [...platforms],
      contentType: useWorkspace.getState().settings.contentTypes[0] ?? '',
      contentPillar: useWorkspace.getState().pillars[0]?.name ?? '',
      status: statuses[0]?.name ?? 'Ideation',
    });
    setPendingEdit(item.id);
  };

  /* ---------------- Popover options ---------------- */

  const popoverItem = popover ? byId.get(popover.rowId) : undefined;
  const popoverCol = popover ? COLUMN_MAP[popover.col] : undefined;
  const popoverOptions: Option[] = (() => {
    if (!popoverCol) return [];
    switch (popoverCol.key) {
      case 'contentType':
        return typeOptions;
      case 'contentPillar':
        return pillarOptions;
      case 'status':
        return statusOptions;
      case 'objective':
        return [{ value: '', label: 'None', render: <span className="text-ink-4">None</span> }, ...objectiveOptions];
      case 'owner':
        return [{ value: '', label: 'Unassigned', render: <span className="text-ink-4">Unassigned</span> }, ...ownerOptions];
      case 'platform':
        return platforms.map((p) => ({
          value: p,
          label: p,
          render: (
            <span className="inline-flex items-center gap-2">
              <PlatformIcon platform={p} /> {p}
            </span>
          ),
        }));
      default:
        return [];
    }
  })();
  const popoverSelected = (() => {
    if (!popoverItem || !popoverCol) return [];
    if (popoverCol.key === 'platform') return popoverItem.platform;
    return [String(popoverItem[popoverCol.field!] ?? '')];
  })();

  const closePopover = () => {
    setPopover(null);
    focusGrid();
  };

  /* ---------------- Rendering ---------------- */

  const renderCell = (item: ContentItem, col: ColumnDef, index: number) => {
    switch (col.key) {
      case 'no': {
        const isSel = selected.has(item.id);
        return (
          <div className="flex h-full items-center gap-0.5 pl-1">
            <span
              draggable
              onDragStart={(e) => {
                setDragId(item.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDrop(null);
              }}
              className="flex h-6 w-4 cursor-grab items-center justify-center text-ink-4 opacity-0 group-hover/row:opacity-100 active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <span className="relative flex w-6 items-center justify-center">
              <span className={cn('text-[12px] text-ink-3 tabular', isSel ? 'hidden' : 'group-hover/row:hidden')}>{index + 1}</span>
              <Checkbox
                checked={isSel}
                onChange={(on, e) => toggleRow(item.id, on, e.shiftKey)}
                label={`Select ${item.title}`}
                className={cn(isSel ? 'flex' : 'hidden group-hover/row:flex')}
              />
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setCtxMenu({ rowId: item.id, x: r.left, y: r.bottom });
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 opacity-0 group-hover/row:opacity-100 hover:bg-muted hover:text-ink"
              aria-label="Row actions"
            >
              <Ellipsis className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      }
      case 'publishDate': {
        if (!item.publishDate) return <span className="text-[12.5px] text-ink-4 italic">Set date</span>;
        const overdue = item.publishDate < today && stageOf(item.status, statuses) !== 'published';
        const isToday = item.publishDate === today;
        return (
          <Tooltip content={overdue ? 'Past post date but not uploaded yet' : isToday ? 'Posting today' : null}>
            <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] tabular', overdue ? 'text-red-600' : 'text-ink')}>
              {formatSheet(item.publishDate)}
              <span className={cn('text-[10.5px]', isToday ? 'rounded bg-brand px-1 font-semibold text-ink' : 'text-ink-4')}>
                {isToday ? 'Today' : weekdayShort(item.publishDate)}
              </span>
            </span>
          </Tooltip>
        );
      }
      case 'contentType':
        return <TypeBadge type={item.contentType} />;
      case 'contentPillar':
        return <PillarBadge pillar={item.contentPillar} />;
      case 'title':
        return (
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openContent(item.id);
              }}
              className={cn(
                'min-w-0 truncate text-left text-[13px] font-semibold decoration-ink-4 underline-offset-2 hover:underline',
                item.title ? 'text-ink' : 'font-normal text-ink-4 italic',
              )}
            >
              {item.title || 'Untitled'}
            </button>
            <span className="flex-1" />
            <Tooltip content="Open details (⇧ Enter)">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openContent(item.id);
                }}
                className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-line bg-white px-1.5 text-[11px] font-medium text-ink-2 opacity-0 shadow-sm group-hover/row:opacity-100 hover:bg-muted"
              >
                <PanelRightOpen className="h-3 w-3" /> Open
              </button>
            </Tooltip>
          </div>
        );
      case 'brief':
      case 'caption':
      case 'cta':
      case 'notes': {
        const text = item[col.key];
        return (
          <div className="group/cell flex min-w-0 items-center gap-1">
            <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', text ? 'text-ink-2' : 'text-ink-4')}>{text ? stripMarkdown(text) : '—'}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActive({ rowId: item.id, col: col.key });
                setTextModal({ rowId: item.id, field: col.key as LongTextField });
              }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 opacity-0 group-hover/cell:opacity-100 hover:bg-muted hover:text-ink"
              aria-label={`Expand ${col.label}`}
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
        );
      }
      case 'reference': {
        const first = item.references[0];
        if (!first) return <span className="text-[12.5px] text-ink-4">—</span>;
        return (
          <span className="inline-flex items-center gap-1.5">
            <a
              href={first}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-medium text-ink hover:bg-brand-soft"
            >
              <LinkSourceIcon url={first} className="h-3 w-3" />
              Open Ref ↗
            </a>
            {item.references.length > 1 && <span className="text-[11px] text-ink-4">+{item.references.length - 1}</span>}
          </span>
        );
      }
      case 'cover':
        return item.coverImage ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openLightbox(item.coverImage);
            }}
            className={cn('block overflow-hidden rounded-md border border-line bg-muted hover:ring-2 hover:ring-brand', density === 'compact' ? 'h-7 w-7' : 'h-9 w-9')}
            aria-label="Preview cover"
          >
            <img src={item.coverImage} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              pickCover(item.id);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-line-strong text-ink-4 opacity-0 group-hover/row:opacity-100 hover:border-ink-3 hover:text-ink"
            aria-label="Upload cover"
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </button>
        );
      case 'contentUrl':
        return isUrl(item.contentUrl) ? (
          <Tooltip content={item.contentUrl}>
            <a
              href={normaliseUrl(item.contentUrl)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-white px-1.5 text-[11.5px] font-medium text-ink hover:border-ink-3"
            >
              <LinkSourceIcon url={item.contentUrl} className="h-3 w-3" />
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </Tooltip>
        ) : (
          <span className="text-[12.5px] text-ink-4">—</span>
        );
      case 'status':
        return (
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status={item.status} />
            {stageOf(item.status, statuses) === 'published' && (contentER(item) ?? 0) > 0 && (
              <Tooltip content="Engagement rate">
                <span className="text-[10.5px] font-semibold text-emerald-700 tabular">{formatPct(contentER(item) ?? 0)}</span>
              </Tooltip>
            )}
          </span>
        );
      case 'platform':
        return <PlatformIcons platforms={item.platform} />;
      case 'owner': {
        const m = team.find((t) => t.id === item.owner);
        return m ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink">
            <Avatar member={m} size={20} />
            <span className="truncate">{m.name.split(' ')[0]}</span>
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-4">—</span>
        );
      }
      case 'objective':
        return <span className={cn('text-[12.5px]', item.objective ? 'text-ink-2' : 'text-ink-4')}>{item.objective || '—'}</span>;
      case 'kpi':
        return <span className={cn('block truncate text-[12.5px]', item.kpi ? 'text-ink-2' : 'text-ink-4')}>{item.kpi || '—'}</span>;
      default:
        return null;
    }
  };

  const editorFor = (item: ContentItem, col: ColumnDef, seed?: string) => {
    const pos = { rowId: item.id, col: col.key };
    const initial =
      seed ??
      (col.editor === 'reference' ? item.references[0] ?? '' : col.editor === 'url' ? item.contentUrl : String(item[col.field!] ?? ''));
    return (
      <CellInput
        initial={initial}
        type={col.editor === 'date' ? 'date' : col.editor === 'url' || col.editor === 'reference' ? 'url' : 'text'}
        placeholder={col.editor === 'url' || col.editor === 'reference' ? 'https://…' : ''}
        onCommit={(v, reason) => onCellCommit(pos, v, reason)}
        onCancel={() => {
          setEditing(null);
          focusGrid();
        }}
      />
    );
  };

  const textModalItem = textModal ? byId.get(textModal.rowId) : undefined;
  const ctxItem = ctxMenu ? byId.get(ctxMenu.rowId) : undefined;

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        className="scrollbar-thin relative h-full overflow-auto rounded-[14px] border border-line bg-white outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <table className="sheet text-left" style={{ width: tableWidth, minWidth: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const isFrozen = frozen.has(c.key);
                const sorted = c.sortKey && sort.key === c.sortKey;
                const Icon = c.icon;
                return (
                  <th
                    key={c.key}
                    className={cn('h-9 px-2.5 text-[12px] font-semibold text-ink', isFrozen && 'is-frozen', c.key === lastFrozen && 'is-last-frozen')}
                    style={isFrozen ? { left: frozen.get(c.key), position: 'sticky' } : undefined}
                  >
                    {c.key === 'no' ? (
                      <div className="flex items-center gap-1 pl-5">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={someSelected}
                          onChange={(on) => setSelected(on ? new Set(rowIds) : new Set())}
                          label="Select all"
                        />
                        <span className="ml-1 text-ink-3">No</span>
                      </div>
                    ) : c.sortKey ? (
                      <button
                        type="button"
                        onClick={() => setSort(c.sortKey!)}
                        className="group/th flex w-full items-center gap-1.5 text-left"
                        title={`Sort by ${c.label}`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" />
                        <span className="truncate">{c.label}</span>
                        <span className={cn('ml-auto text-ink-3', !sorted && 'opacity-0 group-hover/th:opacity-60')}>
                          {sorted && sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                        </span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" />
                        <span className="truncate">{c.label}</span>
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isSel = selected.has(item.id);
              const isDrop = drop?.id === item.id;
              return (
                <tr
                  key={item.id}
                  className={cn('group/row', isSel && 'is-selected', isDrop && (drop.pos === 'before' ? 'drop-before' : 'drop-after'), dragId === item.id && 'opacity-40')}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    setDrop({ id: item.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drop) onDropRow(drop.id, drop.pos);
                    setDrop(null);
                    setDragId(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({ rowId: item.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {columns.map((col) => {
                    const isFrozen = frozen.has(col.key);
                    const isActive = active?.rowId === item.id && active.col === col.key;
                    const isEditing = editing?.rowId === item.id && editing.col === col.key;
                    return (
                      <td
                        key={col.key}
                        data-cell={`${item.id}|${col.key}`}
                        className={cn(
                          'relative overflow-hidden px-2.5 align-middle',
                          rowH,
                          col.key === 'no' && 'px-0',
                          isFrozen && 'is-frozen',
                          col.key === lastFrozen && 'is-last-frozen',
                          isActive && !isEditing && 'cell-active',
                          isEditing && 'cell-editing',
                        )}
                        style={isFrozen ? { left: frozen.get(col.key) } : undefined}
                        onMouseDown={(e) => {
                          if ((e.target as HTMLElement).closest('input')) return;
                          if (editing && !isEditing) return; // let the blur commit happen first
                          setActive({ rowId: item.id, col: col.key });
                        }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('a, button, input')) return;
                          const ed = col.editor;
                          // Dropdown cells open on a single click, like Airtable.
                          if (ed === 'select' || ed === 'platform' || ed === 'owner') setPopover({ rowId: item.id, col: col.key });
                          focusGrid();
                        }}
                        onDoubleClick={(e) => {
                          if ((e.target as HTMLElement).closest('a, button, input')) return;
                          startEdit({ rowId: item.id, col: col.key });
                        }}
                      >
                        {isEditing ? editorFor(item, col, editing?.seed) : <div className="flex h-full min-w-0 items-center">{renderCell(item, col, index)}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="group/row">
              <td colSpan={columns.length} className="h-9 !border-r-0 p-0">
                <button
                  type="button"
                  onClick={addInline}
                  className="sticky left-0 flex h-9 items-center gap-2 px-4 text-[12.5px] font-medium text-ink-3 hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" /> New row
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Select-type cell popover */}
      <Popover open={!!popover} anchor={popover ? cellEl(popover.rowId, popover.col) : null} onClose={closePopover} width={220}>
        {popover && popoverItem && popoverCol && (
          <OptionList
            options={popoverOptions}
            selected={popoverSelected}
            multiple={popoverCol.key === 'platform'}
            searchable={popoverOptions.length > 6}
            onSelect={(v) => {
              if (popoverCol.key === 'platform') {
                const cur = popoverItem.platform;
                commit(popoverItem.id, { platform: cur.includes(v) ? cur.filter((p) => p !== v) : [...cur, v] });
                return;
              }
              const field = popoverCol.field!;
              if (String(popoverItem[field] ?? '') !== v) commit(popoverItem.id, { [field]: v } as Partial<ContentItem>);
              closePopover();
            }}
          />
        )}
      </Popover>

      {/* Row context menu */}
      <div ref={ctxAnchorRef} className="pointer-events-none fixed h-px w-px" style={{ left: ctxMenu?.x ?? 0, top: ctxMenu?.y ?? 0 }} />
      <Popover open={!!ctxMenu && !!ctxItem} anchor={ctxAnchorRef.current} onClose={() => setCtxMenu(null)} width={210}>
        {ctxItem && (
          <div className="text-[13px]">
            {[
              { label: 'Open details', icon: PanelRightOpen, run: () => openContent(ctxItem.id), hint: '⇧↵' },
              { label: 'Duplicate', icon: Copy, run: () => duplicateContent(ctxItem.id) && toast.success('Content duplicated'), hint: '⌘D' },
              { label: 'Move up', icon: MoveUp, run: () => moveRow(ctxItem.id, -1), disabled: rowIds.indexOf(ctxItem.id) === 0 },
              { label: 'Move down', icon: MoveDown, run: () => moveRow(ctxItem.id, 1), disabled: rowIds.indexOf(ctxItem.id) === rowIds.length - 1 },
              ...(ctxItem.contentUrl ? [{ label: 'Open posted content', icon: ExternalLink, run: () => window.open(normaliseUrl(ctxItem.contentUrl), '_blank') }] : []),
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={'disabled' in a && a.disabled}
                onClick={() => {
                  setCtxMenu(null);
                  a.run();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-ink hover:bg-muted disabled:opacity-40"
              >
                <a.icon className="h-3.5 w-3.5 text-ink-3" />
                <span className="flex-1">{a.label}</span>
                {'hint' in a && a.hint && <span className="text-[11px] text-ink-4">{a.hint}</span>}
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button
              type="button"
              onClick={() => {
                const ids = selected.has(ctxItem.id) && selected.size > 1 ? [...selected] : [ctxItem.id];
                setCtxMenu(null);
                deleteRows(ids);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
            >
              <Trash className="h-3.5 w-3.5" />
              {selected.has(ctxItem.id) && selected.size > 1 ? `Delete ${selected.size} selected` : 'Delete'}
            </button>
          </div>
        )}
      </Popover>

      <TextEditorModal
        open={!!textModal && !!textModalItem}
        field={textModal?.field ?? 'brief'}
        contentTitle={textModalItem?.title ?? ''}
        value={textModalItem && textModal ? textModalItem[textModal.field] : ''}
        onClose={() => {
          setTextModal(null);
          focusGrid();
        }}
        onSave={(v) => {
          if (textModalItem && textModal) commit(textModalItem.id, { [textModal.field]: v } as Partial<ContentItem>, true);
        }}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const id = coverTarget.current;
          e.target.value = '';
          if (!file || !id) return;
          try {
            commit(id, { coverImage: await fileToCoverDataUrl(file) });
            toast.success('Cover uploaded');
          } catch (err) {
            toast.error('Upload failed', err instanceof Error ? err.message : undefined);
          }
        }}
      />

      <BulkActionBar selectedIds={[...selected]} onClear={() => setSelected(new Set())} onDelete={(ids) => deleteRows(ids)} />
    </>
  );
}
