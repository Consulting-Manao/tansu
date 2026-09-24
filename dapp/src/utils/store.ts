import { atom } from "nanostores";

/** The connected wallet's address; server data lives in TanStack Query. */
export const connectedPublicKey = atom<string | undefined>(undefined);
export const walletInitialized = atom<boolean>(false);
