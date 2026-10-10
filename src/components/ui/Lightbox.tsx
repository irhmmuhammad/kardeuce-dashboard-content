import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useUI } from '@/store/ui';
import { isTopLayer, popLayer, pushLayer } from '@/lib/layers';

export function Lightbox() {
  const src = useUI((s) => s.lightbox);
  const close = useUI((s) => s.openLightbox);
  useEffect(() => {
    if (!src) return;
    const layer = pushLayer();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopLayer(layer)) close(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      popLayer(layer);
      window.removeEventListener('keydown', onKey);
    };
  }, [src, close]);
  if (!src) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110] flex animate-fade-in items-center justify-center bg-ink/80 p-6 backdrop-blur-sm" onClick={() => close(null)}>
      <img src={src} alt="Cover preview" className="max-h-full max-w-full animate-pop-in rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={() => close(null)} className="absolute top-5 right-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close preview">
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}
