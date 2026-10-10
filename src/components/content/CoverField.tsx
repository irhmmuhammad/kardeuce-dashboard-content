import { useRef, useState } from 'react';
import { ImagePlus, Link2, Maximize2, Trash } from 'lucide-react';
import { fileToCoverDataUrl } from '@/lib/image';
import { toast } from '@/store/toast';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { cn, isUrl, normaliseUrl } from '@/lib/utils';

export function CoverField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');
  const openLightbox = useUI((s) => s.openLightbox);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    try {
      onChange(await fileToCoverDataUrl(file));
    } catch (e) {
      toast.error('Upload failed', e instanceof Error ? e.message : undefined);
    }
  };

  if (value) {
    return (
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => openLightbox(value)} className="group relative h-28 w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-muted">
          <img src={value} alt="Cover" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-ink/0 text-white opacity-0 transition group-hover:bg-ink/35 group-hover:opacity-100">
            <Maximize2 className="h-4 w-4" />
          </span>
        </button>
        <div className="flex flex-col gap-1.5">
          <Button size="sm" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
            Replace
          </Button>
          <Button size="sm" variant="danger" icon={<Trash className="h-3.5 w-3.5" />} onClick={() => onChange('')}>
            Remove
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center transition-colors',
          drag ? 'border-brand-strong bg-brand-soft' : 'border-line-strong bg-canvas hover:bg-muted',
        )}
      >
        <ImagePlus className="h-5 w-5 text-ink-3" />
        <div className="text-[12.5px] font-medium text-ink">Drop cover / thumbnail or click to upload</div>
        <div className="text-[11px] text-ink-4">PNG, JPG, WebP · auto-resized for storage</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {urlMode ? (
        <div className="mt-2 flex gap-2">
          <input autoFocus className="input" placeholder="https://… image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button
            size="md"
            variant="primary"
            disabled={!isUrl(url)}
            onClick={() => {
              onChange(normaliseUrl(url));
              setUrl('');
              setUrlMode(false);
            }}
          >
            Use
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setUrlMode(true)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink">
          <Link2 className="h-3.5 w-3.5" /> or paste an image URL
        </button>
      )}
    </div>
  );
}
