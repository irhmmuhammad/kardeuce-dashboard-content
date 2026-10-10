import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Simple brand-neutral glyphs (Lucide dropped brand icons). */
export function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 3c.4 2.6 2.2 4.4 5 4.6" />
    </svg>
  );
}

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const p = platform.toLowerCase();
  if (p.includes('insta')) return <InstagramGlyph className={cn('h-3.5 w-3.5', className)} />;
  if (p.includes('tiktok')) return <TikTokGlyph className={cn('h-3.5 w-3.5', className)} />;
  return <Globe className={cn('h-3.5 w-3.5', className)} />;
}

export function PlatformIcons({ platforms, className }: { platforms: string[]; className?: string }) {
  if (!platforms.length) return <span className="text-ink-4">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-1 text-ink-2', className)}>
      {platforms.map((p) => (
        <span key={p} title={p} className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted">
          <PlatformIcon platform={p} className="h-3 w-3" />
        </span>
      ))}
    </span>
  );
}
