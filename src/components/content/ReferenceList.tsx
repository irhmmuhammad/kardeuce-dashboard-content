import { useState } from 'react';
import { ExternalLink, Globe, Plus, X } from 'lucide-react';
import { InstagramGlyph, TikTokGlyph } from '@/components/badges/PlatformIcon';
import { hostname, isUrl, linkSource, normaliseUrl } from '@/lib/utils';

export function LinkSourceIcon({ url, className = 'h-3.5 w-3.5' }: { url: string; className?: string }) {
  const src = linkSource(url);
  if (src === 'instagram') return <InstagramGlyph className={className} />;
  if (src === 'tiktok') return <TikTokGlyph className={className} />;
  return <Globe className={className} />;
}

export function ReferenceList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const valid = isUrl(draft);
  const add = () => {
    if (!valid) return;
    onChange([...value, normaliseUrl(draft)]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      {value.map((url, i) => (
        <div key={`${url}-${i}`} className="group flex items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 py-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-ink-2">
            <LinkSourceIcon url={url} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-ink">{hostname(url)}</div>
            <div className="truncate text-[11px] text-ink-4">{url}</div>
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="rounded-md p-1 text-ink-3 hover:bg-muted hover:text-ink" aria-label="Open reference">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-md p-1 text-ink-4 hover:bg-red-50 hover:text-red-600" aria-label="Remove reference">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Paste reference link (IG, TikTok, Pinterest, YouTube…)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!valid}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-line bg-white px-3 text-[12.5px] font-medium text-ink hover:bg-muted disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}
