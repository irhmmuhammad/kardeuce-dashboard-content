import { cloneElement, isValidElement, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'right';
  delay?: number;
}

/** Portal tooltip so it never gets clipped by scroll containers. */
export function Tooltip({ content, children, side = 'top', delay = 350 }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number>();

  if (!content || !isValidElement(children)) return children;

  const show = (el: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (side === 'right') setPos({ x: r.right + 8, y: r.top + r.height / 2 });
      else if (side === 'bottom') setPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
      else setPos({ x: r.left + r.width / 2, y: r.top - 8 });
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  const child = children as ReactElement<Record<string, unknown>>;
  const props = child.props as Record<string, ((e: React.SyntheticEvent) => void) | undefined>;

  return (
    <>
      {cloneElement(child, {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
          props.onMouseEnter?.(e);
          show(e.currentTarget);
        },
        onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
          props.onMouseLeave?.(e);
          hide();
        },
        onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
          props.onMouseDown?.(e);
          hide();
        },
      })}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[100] max-w-xs animate-fade-in rounded-lg bg-ink px-2 py-1 text-[11.5px] leading-snug font-medium text-white shadow-lg"
            style={{
              left: pos.x,
              top: pos.y,
              transform:
                side === 'right' ? 'translateY(-50%)' : side === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
