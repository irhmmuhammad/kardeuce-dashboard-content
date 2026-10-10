import { cn } from '@/lib/utils';

/** KARDEUCE mark: a tennis ball on court-dark. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#B7E46C" />
      <circle cx="32" cy="32" r="17" fill="#17211A" />
      <path d="M18.5 21.5c7.5 6 7.5 15 0 21M45.5 21.5c-7.5 6-7.5 15 0 21" stroke="#B7E46C" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
