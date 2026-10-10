import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  open: (opts: ConfirmOptions) => Promise<boolean>;
  close: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  request: null,
  open(opts) {
    return new Promise<boolean>((resolve) => set({ request: { ...opts, resolve } }));
  },
  close(ok) {
    get().request?.resolve(ok);
    set({ request: null });
  },
}));

/** `if (await confirm({ title: 'Delete?' })) { ... }` */
export const confirm = (opts: ConfirmOptions) => useConfirmStore.getState().open(opts);
