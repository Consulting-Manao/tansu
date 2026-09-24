import { atom } from "nanostores";

/** Where the connected wallet's address is kept between visits. */
export const WALLET_STORAGE_KEY = "publicKey";

function storedAddress(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(WALLET_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The connected wallet's address, restored from the last visit; server data
 * lives in TanStack Query.
 */
export const connectedPublicKey = atom<string | undefined>(storedAddress());
/** The wallet kit confirmed the restored address (or there is none). */
export const walletInitialized = atom<boolean>(false);
