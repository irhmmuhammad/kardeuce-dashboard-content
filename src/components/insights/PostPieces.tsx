import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { ArrowUpRight, Check, Info, Link2, Lightbulb, Search, TrendingDown, TrendingUp, Unlink } from 'lucide-react';
import type { SocialPlatform } from '@shared/insights';
import { useInsights } from '@/store/insights';
import { useWorkspace } from '@/store/workspace';
import { useUI } from '@/store/ui';
import { formatShort } from '@/lib/date';
import { cn, formatNumber } from '@/lib/utils';
import { fmtMetric, type Insight, type PostRow } from '@/lib/insights';
import { suggestContent } from '@/services/metrics';
import { PLATFORM_COLORS, alpha } from '@/config/theme';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlatformIcon } from '@/components/badges/PlatformIcon';
import { PillarBadge, StatusBadge, typeIcon } from '@/components/badges/Badges';
import { usePillarByName } from '@/store/workspace';

export function PostThumb({ row, size = 40 }: { row: Pick<PostRow, 'thumbnail' | 'platform' | 'format' | 'pillar'>; size?: number }) {
  const [broken, setBroken] = useState(false);
  const pillar = usePillarByName()(row.pillar);
  const Icon = typeIcon(row.format);
  return (
    <span className="relative inline-flex shrink-0 overflow-hidden rounded-lg bg-muted" style={{ width: size, height: size }}>
      {row.thumbnail && !broken ? (
        // Platform CDN thumbnails expire; fall back to the placeholder when they do.
        <img src={row.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="flex h-full w-full items-center justify-center" style={{ background: pillar ? alpha(pillar.color, 0.14) : undefined }}>
          <Icon className="h-4 w-4 text-ink-3" />
        </span>
      )}
      <span className="absolute right-0.5 bottom-0.5 flex h-4 w-4 items-center justify-center rounded-[5px] text-white" style={{ background: PLATFORM_COLORS[row.platform] }}>
        <PlatformIcon platform={row.platform} className="h-2.5 w-2.5" />
      </span>
    </span>
  );
}

export function SourceTag({ source }: { source: PostRow['source'] }) {
  if (source === 'api') return null;
  return (
    <span className={cn('rounded px-1 py-px text-[10px] font-semibold uppercase', source === 'mock' ? 'bg-amber-50 text-amber-800' : 'bg-muted text-ink-3')}>
      {source === 'mock' ? 'Demo' : 'Manual'}
    </span>
  );
}

/** Opens the content drawer for linked rows, the link picker otherwise. */
export function useOpenRow() {
  const openContent = useUI((s) => s.openContent);
  const openPicker = useLinkPicker((s) => s.open);
  return (row: PostRow) => {
    if (row.content) openContent(row.content.id);
    else if (row.post) openPicker(row.post.id);
  };
}

export function TopContentList({ rows, limit = 6 }: { rows: PostRow[]; limit?: number }) {
  const openRow = useOpenRow();
  const top = rows.slice(0, limit);
  if (!top.length) return <p className="py-6 text-center text-[12.5px] text-ink-4">No posts in this period.</p>;
  return (
    <div className="-mx-2">
      <div className="hidden grid-cols-[minmax(0,1fr)_64px_64px_56px_52px_52px] gap-2 px-2 pb-1.5 text-[10.5px] font-semibold tracking-wide text-ink-4 uppercase md:grid">
        <span>Content</span>
        <span className="text-right">Views</span>
        <span className="text-right">Reach</span>
        <span className="text-right">ER</span>
        <span className="text-right">Saves</span>
        <span className="text-right">Shares</span>
      </div>
      <ol className="divide-y divide-line">
        {top.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => openRow(r)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-hover md:grid-cols-[minmax(0,1fr)_64px_64px_56px_52px_52px]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="w-4 shrink-0 text-[11px] text-ink-4 tabular">{i + 1}</span>
                <PostThumb row={r} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{r.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-[11px] whitespace-nowrap text-ink-3">
                    <span className="shrink-0 tabular">{formatShort(r.date)}</span>
                    {r.pillar !== 'Unlinked' && <PillarBadge pillar={r.pillar} size="xs" className="shrink-0" />}
                    <SourceTag source={r.source} />
                    {!r.content && r.post && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-ink-4" title="Not linked to a Content Plan item">
                        <Unlink className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                </span>
              </span>
              <span className="text-right text-[12.5px] font-semibold text-ink tabular md:hidden">{fmtMetric(r.er, 'pct')} ER</span>
              <span className="hidden text-right text-[12.5px] text-ink tabular md:block">{fmtMetric(r.metrics.views)}</span>
              <span className="hidden text-right text-[12.5px] text-ink tabular md:block">{fmtMetric(r.metrics.reach)}</span>
              <span className="hidden text-right text-[12.5px] font-semibold text-ink tabular md:block">{fmtMetric(r.er, 'pct')}</span>
              <span className="hidden text-right text-[12.5px] text-ink-2 tabular md:block">{fmtMetric(r.metrics.saves)}</span>
              <span className="hidden text-right text-[12.5px] text-ink-2 tabular md:block">{fmtMetric(r.metrics.shares)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function InsightList({ insights }: { insights: Insight[] }) {
  if (!insights.length) return <p className="py-4 text-[12.5px] text-ink-4">Not enough data yet. Insights appear once there are a few posts in this period.</p>;
  return (
    <ul className="space-y-2">
      {insights.map((i) => {
        const Icon = i.tone === 'good' ? TrendingUp : i.tone === 'warn' ? TrendingDown : i.id.startsWith('best') ? Lightbulb : Info;
        return (
          <li key={i.id} className="flex items-start gap-2.5 rounded-xl border border-line px-3 py-2.5">
            <span
              className={cn(
                'mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
                i.tone === 'good' ? 'bg-brand-soft text-brand-ink' : i.tone === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-muted text-ink-2',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-[12.5px] leading-relaxed text-ink">{i.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Link to content ---------------- */

export const useLinkPicker = create<{ postId: string | null; open: (id: string) => void; close: () => void }>()((set) => ({
  postId: null,
  open: (postId) => set({ postId }),
  close: () => set({ postId: null }),
}));

export function LinkContentModal() {
  const postId = useLinkPicker((s) => s.postId);
  const close = useLinkPicker((s) => s.close);
  const post = useInsights((s) => s.posts.find((p) => p.id === postId));
  const posts = useInsights((s) => s.posts);
  const linkPost = useInsights((s) => s.linkPost);
  const contents = useWorkspace((s) => s.contents);
  const [q, setQ] = useState('');

  const options = useMemo(() => {
    if (!post) return [];
    const taken = new Set(posts.filter((p) => p.id !== post.id && p.platform === post.platform && p.linkedContentId && p.linkMethod !== 'none').map((p) => p.linkedContentId));
    const ranked = suggestContent(post, contents);
    const needle = q.trim().toLowerCase();
    return ranked.filter((c) => !needle || c.title.toLowerCase().includes(needle)).map((c) => ({ c, taken: taken.has(c.id) }));
  }, [post, posts, contents, q]);

  return (
    <Modal
      open={!!post}
      onClose={() => {
        close();
        setQ('');
      }}
      size="lg"
      title="Link to content"
      description={post ? `Pick the Content Plan item this ${post.platform} post belongs to. Its numbers will show on that item.` : undefined}
    >
      {post && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl bg-canvas p-3">
            <PostThumb row={{ thumbnail: post.thumbnail, platform: post.platform, format: post.demoFormat ?? post.type, pillar: post.demoPillar ?? '' }} size={44} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[12.5px] text-ink">{post.caption || '(no caption)'}</p>
              <p className="mt-1 text-[11px] text-ink-4">
                {new Date(post.publishedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {formatNumber(post.metrics.views ?? 0)} views
              </p>
            </div>
            <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink">
              Open <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
            <input className="input pl-8" placeholder="Search content…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <ul className="scrollbar-thin max-h-[46vh] space-y-1 overflow-y-auto">
            {options.slice(0, 40).map(({ c, taken }) => {
              const current = post.linkedContentId === c.id && post.linkMethod !== 'none';
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={taken}
                    onClick={() => {
                      linkPost(post.id, c.id);
                      close();
                    }}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-hover disabled:opacity-45', current && 'bg-brand-soft')}
                  >
                    <span className="w-14 shrink-0 text-[11.5px] text-ink-3 tabular">{c.publishDate ? formatShort(c.publishDate) : '—'}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{c.title}</span>
                    {c.contentPillar && <PillarBadge pillar={c.contentPillar} size="xs" />}
                    <StatusBadge status={c.status} size="xs" className="hidden sm:inline-flex" />
                    {current && <Check className="h-3.5 w-3.5 text-brand-ink" />}
                    {taken && <span className="text-[11px] text-ink-4">linked to another post</span>}
                  </button>
                </li>
              );
            })}
            {!options.length && <li className="py-6 text-center text-[12.5px] text-ink-4">No content matches.</li>}
          </ul>
          {post.linkedContentId && post.linkMethod !== 'none' && (
            <div className="flex justify-end border-t border-line pt-3">
              <Button
                variant="ghost"
                icon={<Unlink className="h-3.5 w-3.5" />}
                onClick={() => {
                  linkPost(post.id, null);
                  close();
                }}
              >
                Unlink
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function LinkButton({ postId, linked }: { postId: string; linked: boolean }) {
  const open = useLinkPicker((s) => s.open);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(postId);
      }}
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium', linked ? 'text-ink-3 hover:bg-muted hover:text-ink' : 'bg-brand-soft text-brand-ink hover:bg-brand/40')}
    >
      <Link2 className="h-3 w-3" />
      {linked ? 'Change' : 'Link to content'}
    </button>
  );
}

export function platformLabel(p: SocialPlatform, key: 'saves'): string {
  return key === 'saves' && p === 'TikTok' ? 'Favorites' : 'Saves';
}
