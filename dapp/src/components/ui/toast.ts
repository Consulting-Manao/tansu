import { atom } from "nanostores";

export type ToastTone = "success" | "danger" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string | undefined;
  /** A link to the evidence: the transaction, the file. */
  link?: { label: string; href: string } | undefined;
}

/** The toasts on screen, oldest first. */
export const toasts = atom<Toast[]>([]);

let next = 0;

/** Shows a toast for `ms`, or until dismissed. */
function show(toast: Omit<Toast, "id">, ms = 6000) {
  const id = ++next;
  toasts.set([...toasts.get(), { ...toast, id }]);
  if (typeof window !== "undefined")
    window.setTimeout(() => dismissToast(id), ms);
  return id;
}

export function dismissToast(id: number) {
  toasts.set(toasts.get().filter((toast) => toast.id !== id));
}

/**
 * Feedback after an action. A success is a toast; an error belongs where it
 * happened (a field, a flow's error view), and a toast only when nothing on
 * screen can hold it.
 */
export const toast = {
  success: (title: string, description?: string, link?: Toast["link"]) =>
    show({ tone: "success", title, description, link }),
  info: (title: string, description?: string, link?: Toast["link"]) =>
    show({ tone: "info", title, description, link }),
  error: (title: string, description?: string) =>
    show({ tone: "danger", title, description }, 10000),
};
