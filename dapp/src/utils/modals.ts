/**
 * The app-wide modals, opened from anywhere and shown by `ModalHost` in the
 * layout. One at a time: opening one replaces the other, and a page change
 * closes it.
 */
import { atom } from "nanostores";

export interface Modals {
  createProject: Record<string, never>;
  join: Record<string, never>;
  profile: { address: string };
  funding: { exists: boolean; balance: number; network: "mainnet" | "testnet" };
  terms: Record<string, never>;
}

type Opened = {
  [Name in keyof Modals]: { name: Name; props: Modals[Name] };
}[keyof Modals];

export const openedModal = atom<Opened | null>(null);

export function openModal<Name extends keyof Modals>(
  name: Name,
  props: Modals[Name],
): void {
  openedModal.set({ name, props } as Opened);
}

export function closeModal(): void {
  openedModal.set(null);
}
