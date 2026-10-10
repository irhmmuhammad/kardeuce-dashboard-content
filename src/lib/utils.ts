export type ClassValue = string | false | null | undefined | 0;

/** Tiny className joiner (no dependency needed). */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}

export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('en');

export function formatNumber(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '0';
  return opts.compact && Math.abs(n) >= 10000 ? compact.format(n) : plain.format(Math.round(n));
}

export function formatPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function isUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value.startsWith('http') ? value : `https://${value}`);
    return !!u.hostname && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function normaliseUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function hostname(url: string): string {
  try {
    return new URL(normaliseUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export type LinkSource = 'instagram' | 'tiktok' | 'youtube' | 'pinterest' | 'twitter' | 'web';

export function linkSource(url: string): LinkSource {
  const h = hostname(url);
  if (h.includes('instagram.com')) return 'instagram';
  if (h.includes('tiktok.com')) return 'tiktok';
  if (h.includes('youtube.com') || h.includes('youtu.be')) return 'youtube';
  if (h.includes('pinterest.')) return 'pinterest';
  if (h.includes('x.com') || h.includes('twitter.com')) return 'twitter';
  return 'web';
}

export function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function stripMarkdown(s: string): string {
  return s
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n+/g, ' ')
    .trim();
}
