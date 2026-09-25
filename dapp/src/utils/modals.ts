/**
 * The app-wide modals, opened from anywhere and shown by `ModalHost` in the
 * layout. A new one opens on top of those open, which it never replaces: a
 * funding prompt leaves a half-filled form, or the terms, where they were.
 * A page change closes them all.
 */
import { atom } from "nanostores";

export interface Modals {
  createProject: Record<string, never>;
  join: Record<string, never>;
  profile: { address: string };
  funding: { exists: boolean; balance: number; network: "mainnet" | "testnet" };
  terms: Record<string, never>;
}

export type Opened = {
  [Name in keyof Modals]: { name: Name; props: Modals[Name] };
}[keyof Modals];

/** The open modals, the one on top last; each at most once. */
export const openedModals = atom<Opened[]>([]);

export function openModal<Name extends keyof Modals>(
  name: Name,
  props: Modals[Name],
): void {
  const others = openedModals.get().filter((modal) => modal.name !== name);
  openedModals.set([...others, { name, props } as Opened]);
}

export function closeModal(name: keyof Modals): void {
  openedModals.set(openedModals.get().filter((modal) => modal.name !== name));
}

export function closeAllModals(): void {
  openedModals.set([]);
}
