import { initials, cn } from '@/lib/utils';
import type { TeamMember } from '@/types';

export function Avatar({ member, size = 22, className }: { member?: TeamMember; size?: number; className?: string }) {
  if (!member) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-4', className)}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white', className)}
      style={{ width: size, height: size, background: member.color, fontSize: size * 0.4 }}
      title={member.name}
    >
      {initials(member.name)}
    </span>
  );
}
