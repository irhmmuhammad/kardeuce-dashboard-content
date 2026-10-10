import {
  CalendarDays,
  CircleDot,
  FileText,
  Gauge,
  Hash,
  Image,
  Layers,
  Link2,
  Megaphone,
  MessageSquareText,
  MonitorSmartphone,
  NotebookPen,
  Paperclip,
  Shapes,
  Target,
  Type,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { ColumnKey, ContentItem, SortKey } from '@/types';

export type CellEditor =
  | 'none'
  | 'text'
  | 'date'
  | 'select'
  | 'longtext'
  | 'url'
  | 'reference'
  | 'cover'
  | 'platform'
  | 'owner';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  width: number;
  icon: LucideIcon;
  editor: CellEditor;
  sortKey?: SortKey;
  /** Core columns can't be hidden. */
  locked?: boolean;
  optional?: boolean;
  /** Field on ContentItem that this column edits (for select/text cells). */
  field?: keyof ContentItem;
}

export const COLUMNS: ColumnDef[] = [
  { key: 'no', label: 'No', width: 72, icon: Hash, editor: 'none', locked: true },
  { key: 'publishDate', label: 'Date Post', width: 134, icon: CalendarDays, editor: 'date', sortKey: 'publishDate', field: 'publishDate' },
  { key: 'contentType', label: 'Content Type', width: 138, icon: Shapes, editor: 'select', sortKey: 'contentType', field: 'contentType' },
  { key: 'contentPillar', label: 'Content Pillar', width: 142, icon: Layers, editor: 'select', sortKey: 'contentPillar', field: 'contentPillar' },
  { key: 'title', label: 'Judul Konten', width: 236, icon: Type, editor: 'text', sortKey: 'title', locked: true, field: 'title' },
  { key: 'brief', label: 'Brief', width: 210, icon: FileText, editor: 'longtext', field: 'brief' },
  { key: 'caption', label: 'Caption', width: 230, icon: MessageSquareText, editor: 'longtext', field: 'caption' },
  { key: 'reference', label: 'Reference', width: 124, icon: Paperclip, editor: 'reference' },
  { key: 'cover', label: 'Cover', width: 76, icon: Image, editor: 'cover', field: 'coverImage' },
  { key: 'contentUrl', label: 'Link Konten', width: 108, icon: Link2, editor: 'url', field: 'contentUrl' },
  { key: 'status', label: 'Status Upload', width: 148, icon: CircleDot, editor: 'select', sortKey: 'status', field: 'status' },
  { key: 'platform', label: 'Platform', width: 104, icon: MonitorSmartphone, editor: 'platform', optional: true, field: 'platform' },
  { key: 'owner', label: 'PIC', width: 150, icon: UserRound, editor: 'owner', optional: true, field: 'owner' },
  { key: 'cta', label: 'CTA', width: 210, icon: Megaphone, editor: 'longtext', optional: true, field: 'cta' },
  { key: 'objective', label: 'Objective', width: 128, icon: Target, editor: 'select', optional: true, field: 'objective' },
  { key: 'kpi', label: 'KPI', width: 170, icon: Gauge, editor: 'text', optional: true, field: 'kpi' },
  { key: 'notes', label: 'Notes', width: 210, icon: NotebookPen, editor: 'longtext', optional: true, field: 'notes' },
];

export const COLUMN_MAP = Object.fromEntries(COLUMNS.map((c) => [c.key, c])) as Record<ColumnKey, ColumnDef>;

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'publishDate', label: 'Date Post' },
  { key: 'status', label: 'Status' },
  { key: 'contentPillar', label: 'Content Pillar' },
  { key: 'contentType', label: 'Content Type' },
  { key: 'title', label: 'Title' },
  { key: 'manual', label: 'Manual order' },
];
