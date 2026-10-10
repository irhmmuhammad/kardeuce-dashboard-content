import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface PopoverProps {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number | 'anchor';
  className?: string;
  offset?: number;
}

/**
 * Anchored floating panel rendered in a portal. Flips above the anchor when
 * there's no room below, and closes on outside click / Escape.
 */
export function Popover({ open, anchor, onClose, children, align = 'start', width, className, offset = 6 }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0, top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const panel = panelRef.current;
      const ph = panel?.offsetHeight ?? 0;
      const pw = width === 'anchor' ? r.width : typeof width === 'number' ? width : panel?.offsetWidth ?? 0;
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow < ph + 16 && r.top > ph + 16 ? r.top - ph - offset : r.bottom + offset;
      let left = align === 'end' ? r.right - pw : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      setStyle({ top, left, width: width === 'anchor' ? Math.max(r.width, 180) : width, opacity: 1 });
    };
    place();
    const ro = new ResizeObserver(place);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, align, width, offset]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className={cn(
        'fixed z-[80] animate-pop-in rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-pop)]',
        className,
      )}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
