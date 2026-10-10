import type { ContentItem, PlatformPost } from '@/types';
import { diffDays, toISO } from '@/lib/date';

/**
 * Link synced posts to Content Plan items.
 *  1. Permalink equals the item's "Link Konten".
 *  2. Otherwise: published within ±1 day of the plan date AND the caption is
 *     similar enough to the item's title / caption.
 * Manual links (and explicit unlinks) are never touched. Each content item
 * gets at most one post per platform.
 */

export const SIMILARITY_THRESHOLD = 0.5;

export function normalisePermalink(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`);
    const host = u.hostname.replace(/^(www\.|m\.|vm\.)/, '').toLowerCase();
    // Instagram serves the same media under /p/, /reel/ and /reels/.
    const path = u.pathname.replace(/\/+$/, '').replace(/^\/(reels?|p|tv)\//, '/p/').toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

const STOP = new Set(['dan', 'yang', 'di', 'ke', 'the', 'a', 'of', 'to', 'buat', 'lo', 'gue', 'ini', 'itu', 'and', 'vs', 'kardeuce']);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Share of the title's words that appear in the caption (0–1). */
function containment(title: string, caption: string): number {
  const t = new Set(tokens(title));
  if (!t.size) return 0;
  const c = new Set(tokens(caption));
  let hit = 0;
  t.forEach((w) => c.has(w) && hit++);
  return hit / t.size;
}

/** Sørensen–Dice over word sets (0–1). */
function dice(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  A.forEach((w) => B.has(w) && both++);
  return (2 * both) / (A.size + B.size);
}

export function similarity(post: Pick<PlatformPost, 'caption'>, c: ContentItem): number {
  return Math.max(containment(c.title, post.caption), c.caption ? dice(c.caption, post.caption) : 0, c.hook ? containment(c.hook, post.caption) * 0.9 : 0);
}

export function postLocalDate(p: Pick<PlatformPost, 'publishedAt'>): string {
  const d = new Date(p.publishedAt);
  return Number.isNaN(d.getTime()) ? p.publishedAt.slice(0, 10) : toISO(d);
}

/** Returns the posts with linkedContentId/linkMethod filled where a match was found. */
export function autoLink(posts: PlatformPost[], contents: ContentItem[]): PlatformPost[] {
  const taken = new Set<string>(); // `${contentId}:${platform}`
  for (const p of posts) if (p.linkedContentId && p.linkMethod !== 'none') taken.add(`${p.linkedContentId}:${p.platform}`);
  const byPermalink = new Map<string, ContentItem>();
  for (const c of contents) if (c.contentUrl) byPermalink.set(normalisePermalink(c.contentUrl), c);
  const exists = new Set(contents.map((c) => c.id));

  return posts.map((p) => {
    // Respect manual decisions; drop links to deleted content.
    if (p.linkMethod === 'manual' || p.linkMethod === 'none') {
      if (p.linkedContentId && !exists.has(p.linkedContentId)) return { ...p, linkedContentId: undefined, linkMethod: undefined };
      return p;
    }
    if (p.linkedContentId && exists.has(p.linkedContentId)) return p;

    const byUrl = byPermalink.get(normalisePermalink(p.permalink));
    if (byUrl && !taken.has(`${byUrl.id}:${p.platform}`)) {
      taken.add(`${byUrl.id}:${p.platform}`);
      return { ...p, linkedContentId: byUrl.id, linkMethod: 'permalink' as const };
    }

    const date = postLocalDate(p);
    let best: { c: ContentItem; score: number } | null = null;
    for (const c of contents) {
      if (!c.publishDate || Math.abs(diffDays(c.publishDate, date)) > 1) continue;
      if (c.platform.length && !c.platform.includes(p.platform)) continue;
      if (taken.has(`${c.id}:${p.platform}`)) continue;
      const score = similarity(p, c) + (c.publishDate === date ? 0.1 : 0);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) best = { c, score };
    }
    if (best) {
      taken.add(`${best.c.id}:${p.platform}`);
      return { ...p, linkedContentId: best.c.id, linkMethod: 'similarity' as const };
    }
    return p.linkedContentId ? { ...p, linkedContentId: undefined, linkMethod: undefined } : p;
  });
}

/** Content items ranked as link suggestions for one post (for the picker). */
export function suggestContent(post: PlatformPost, contents: ContentItem[]): ContentItem[] {
  const date = postLocalDate(post);
  return contents
    .map((c) => {
      const gap = c.publishDate ? Math.abs(diffDays(c.publishDate, date)) : 999;
      return { c, score: similarity(post, c) + Math.max(0, 1 - gap / 7) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}
