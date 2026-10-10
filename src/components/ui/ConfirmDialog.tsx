import { TriangleAlert } from 'lucide-react';
import { useConfirmStore } from '@/store/confirm';
import { Modal } from './Modal';
import { Button } from './Button';

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const close = useConfirmStore((s) => s.close);
  const danger = request?.tone !== 'default';
  return (
    <Modal open={!!request} onClose={() => close(false)} size="sm">
      {request && (
        <div className="p-5">
          <div className="flex gap-3">
            {danger && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <TriangleAlert className="h-4.5 w-4.5" />
              </div>
            )}
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{request.title}</h2>
              {request.description && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{request.description}</p>}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              {request.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              data-autofocus
              variant={danger ? 'primary' : 'primary'}
              className={danger ? '!border-red-600 !bg-red-600 hover:!bg-red-700' : ''}
              onClick={() => close(true)}
            >
              {request.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
