import { CircleDashed, Clapperboard, Image, Images, Layers, Music2, UsersRound, type LucideIcon } from 'lucide-react';
import { TONES, alpha } from '@/config/theme';
import { useWorkspace } from '@/store/workspace';
import { cn } from '@/lib/utils';
import type { IdeaPriority } from '@/types';

const TYPE_ICONS: Record<string, LucideIcon> = {
  reels: Clapperboard,
  carousel: Images,
  static: Image,
  story: CircleDashed,
  tiktok: Music2,
  ugc: UsersRound,
};

export function typeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type.toLowerCase()] ?? Layers;
}

export function StatusBadge({ status, className, size = 'sm' }: { status: string; className?: string; size?: 'xs' | 'sm' }) {
  const statuses = useWorkspace((s) => s.settings.statuses);
  if (!status) return <span className="text-ink-4">—</span>;
  const tone = TONES[statuses.find((s) => s.name === status)?.tone ?? 'gray'];
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
        size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-[22px] px-2 text-[11.5px]',
        tone.badge,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
      <span className="truncate">{status}</span>
    </span>
  );
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const statuses = useWorkspace((s) => s.settings.statuses);
  const tone = TONES[statuses.find((s) => s.name === status)?.tone ?? 'gray'];
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', tone.dot, className)} title={status} />;
}

export function PillarBadge({ pillar, className, size = 'sm' }: { pillar: string; className?: string; size?: 'xs' | 'sm' }) {
  const pillars = useWorkspace((s) => s.pillars);
  if (!pillar) return <span className="text-ink-4">—</span>;
  const color = pillars.find((p) => p.name === pillar)?.color ?? '#9aa29c';
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md font-medium whitespace-nowrap text-ink',
        size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-[22px] px-2 text-[11.5px]',
        className,
      )}
      style={{ background: alpha(color, 0.12), boxShadow: `inset 0 0 0 1px ${alpha(color, 0.22)}` }}
    >
      <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="truncate">{pillar}</span>
    </span>
  );
}

export function TypeBadge({ type, className, iconOnly }: { type: string; className?: string; iconOnly?: boolean }) {
  if (!type) return <span className="text-ink-4">—</span>;
  const Icon = typeIcon(type);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap text-ink-2', className)}>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-ink-2">
        <Icon className="h-3 w-3" />
      </span>
      {!iconOnly && type}
    </span>
  );
}

const PRIORITY: Record<IdeaPriority, string> = {
  High: 'bg-red-50 text-red-700 ring-red-200',
  Medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  Low: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
};

export function PriorityBadge({ priority }: { priority: IdeaPriority }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset', PRIORITY[priority])}>
      {priority}
    </span>
  );
}
