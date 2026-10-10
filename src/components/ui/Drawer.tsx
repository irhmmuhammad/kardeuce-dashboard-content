import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { isTopLayer, popLayer, pushLayer } from '@/lib/layers';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  className?: string;
}

export function Drawer({ open, onClose, children, width = 'max-w-[640px]', className }: DrawerProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const layer = pushLayer();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopLayer(layer)) {
        const t = e.target as HTMLElement;
        // First Escape just leaves the field you're typing in.
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.closest('[data-drawer]')) {
          t.blur();
          return;
        }
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      popLayer(layer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[55] flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-ink/20" onClick={onClose} />
      <aside
        data-drawer
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex h-full w-full animate-slide-in flex-col border-l border-line bg-white shadow-[var(--shadow-pop)]',
          width,
          className,
        )}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}
