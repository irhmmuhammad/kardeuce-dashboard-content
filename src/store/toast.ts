import { create } from 'zustand';
import { uid } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push(t) {
    const id = uid('t');
    const item: ToastItem = { duration: t.action ? 6000 : 3200, ...t, id };
    set({ toasts: [...get().toasts.slice(-3), item] });
    window.setTimeout(() => get().dismiss(id), item.duration);
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Imperative helpers usable from anywhere (store actions, event handlers). */
export const toast = {
  success: (title: string, description?: string, action?: ToastItem['action']) =>
    useToasts.getState().push({ title, description, tone: 'success', action }),
  error: (title: string, description?: string) => useToasts.getState().push({ title, description, tone: 'error' }),
  info: (title: string, description?: string, action?: ToastItem['action']) =>
    useToasts.getState().push({ title, description, tone: 'info', action }),
};
