import { cn } from '@/lib/utils';

/** KARDEUCE mark (the K with a tennis ball) in a round frame. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo-kardeuce.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={cn('shrink-0 rounded-full object-cover ring-1 ring-black/5', className)}
    />
  );
}
