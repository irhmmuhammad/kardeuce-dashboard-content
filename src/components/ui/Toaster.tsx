import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useToasts } from '@/store/toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[120] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:right-6 sm:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border border-ink-2 bg-ink px-3.5 py-3 text-white shadow-[var(--shadow-pop)]"
        >
          <span className={cn('mt-0.5', t.tone === 'success' ? 'text-brand' : t.tone === 'error' ? 'text-red-400' : 'text-sky-300')}>
            {t.tone === 'success' ? <CircleCheck className="h-4 w-4" /> : t.tone === 'error' ? <CircleAlert className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{t.title}</p>
            {t.description && <p className="mt-0.5 text-[12px] text-white/65">{t.description}</p>}
          </div>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
              className="rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold text-brand hover:bg-white/10"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" onClick={() => dismiss(t.id)} className="rounded-md p-0.5 text-white/50 hover:text-white" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
