import type { Tone } from '@/types';

/**
 * Status / UI tones. Full class strings live here so Tailwind can see them.
 */
export const TONES: Record<Tone, { badge: string; dot: string; soft: string; hex: string }> = {
  gray: { badge: 'bg-zinc-100 text-zinc-700 ring-zinc-200', dot: 'bg-zinc-400', soft: 'bg-zinc-50', hex: '#a1a1aa' },
  purple: { badge: 'bg-purple-50 text-purple-700 ring-purple-200', dot: 'bg-purple-500', soft: 'bg-purple-50', hex: '#a855f7' },
  orange: { badge: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500', soft: 'bg-orange-50', hex: '#f97316' },
  yellow: { badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-400', soft: 'bg-amber-50', hex: '#f59e0b' },
  blue: { badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500', soft: 'bg-blue-50', hex: '#3b82f6' },
  cyan: { badge: 'bg-cyan-50 text-cyan-800 ring-cyan-200', dot: 'bg-cyan-500', soft: 'bg-cyan-50', hex: '#06b6d4' },
  indigo: { badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500', soft: 'bg-indigo-50', hex: '#6366f1' },
  green: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', soft: 'bg-emerald-50', hex: '#10b981' },
  pink: { badge: 'bg-pink-50 text-pink-700 ring-pink-200', dot: 'bg-pink-500', soft: 'bg-pink-50', hex: '#ec4899' },
  red: { badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', soft: 'bg-red-50', hex: '#ef4444' },
  teal: { badge: 'bg-teal-50 text-teal-700 ring-teal-200', dot: 'bg-teal-500', soft: 'bg-teal-50', hex: '#14b8a6' },
  lime: { badge: 'bg-lime-50 text-lime-800 ring-lime-200', dot: 'bg-lime-500', soft: 'bg-lime-50', hex: '#84cc16' },
};

export const TONE_KEYS = Object.keys(TONES) as Tone[];

/**
 * Categorical palette for pillars (and any chart that colours by pillar).
 * Assigned in this fixed order, never cycled. The first four were validated
 * all-pairs for colour-vision deficiency (dataviz validator, light surface):
 * clay orange, hard-court blue, Wimbledon violet, grass aqua.
 */
export const PILLAR_PALETTE = [
  '#eb6834', // clay
  '#2a78d6', // hard court
  '#4a3aa7', // wimbledon
  '#1baf7a', // grass
  '#eda100',
  '#e87ba4',
  '#008300',
  '#e34948',
];

/**
 * Platform identity colours, used in every Instagram-vs-TikTok chart.
 * Validated as a pair (dataviz validator, light surface): CVD ΔE 17, contrast ≥ 3:1.
 */
export const PLATFORM_COLORS = {
  Instagram: '#c2347a',
  TikTok: '#3b6fe0',
} as const;

export const TEAM_COLORS = ['#17211a', '#2a78d6', '#eb6834', '#4a3aa7', '#1baf7a', '#e87ba4', '#eda100', '#008300'];

/** Hex → rgba string with alpha, used for pillar tinted pills/cards. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
