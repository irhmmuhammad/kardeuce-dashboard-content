import { Copy, Hash } from 'lucide-react';
import { AutoTextarea } from '@/components/ui/Field';
import { toast } from '@/store/toast';
import { cn } from '@/lib/utils';

const IG_LIMIT = 2200;
const IG_HASHTAG_LIMIT = 30;

export function CaptionEditor({ value, onChange, autoFocus, minRows = 6 }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; minRows?: number }) {
  const hashtags = (value.match(/#[\p{L}\d_]+/gu) ?? []).length;
  const over = value.length > IG_LIMIT;
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-white focus-within:border-ink-3 focus-within:ring-4 focus-within:ring-brand/30">
      <AutoTextarea
        autoFocus={autoFocus}
        value={value}
        minRows={minRows}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tulis caption di sini… hook di baris pertama, CTA di akhir, hashtag secukupnya."
        className="rounded-none border-0 focus:ring-0"
      />
      <div className="flex items-center gap-3 border-t border-line bg-canvas/70 px-3 py-1.5 text-[11px] text-ink-3">
        <span className={cn('tabular', over && 'font-semibold text-red-600')}>
          {value.length.toLocaleString()} / {IG_LIMIT.toLocaleString()}
        </span>
        <span className={cn('inline-flex items-center gap-0.5 tabular', hashtags > IG_HASHTAG_LIMIT && 'font-semibold text-red-600')}>
          <Hash className="h-3 w-3" />
          {hashtags} hashtags
        </span>
        <span className="hidden text-ink-4 sm:inline">First line preview: “{value.split('\n')[0]?.slice(0, 48) || '—'}”</span>
        <button
          type="button"
          disabled={!value}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => toast.success('Caption copied'),
              () => toast.error('Copy failed'),
            );
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-ink-2 hover:bg-white hover:text-ink disabled:opacity-40"
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
    </div>
  );
}
