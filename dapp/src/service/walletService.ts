/**
 * The connected wallet: one address, in `connectedPublicKey`. The wallets kit
 * is heavy, so it loads when a wallet is needed.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { fetchWithin } from "utils/deadline";
import { openModal } from "utils/modals";
import {
  connectedPublicKey,
  WALLET_STORAGE_KEY,
  walletInitialized,
} from "utils/store";

const kit = async () =>
  (await import("../components/stellar-wallets-kit")).StellarWalletsKit;

export function loadedPublicKey(): string | undefined {
  return connectedPublicKey.get();
}

/** The connected wallet's address, for a write; throws when there is none. */
export function connectedAddress(): string {
  const address = loadedPublicKey();
  if (!address) throw new Error("Please connect your wallet first");
  return address;
}

function setConnection(address: string): void {
  localStorage.setItem(WALLET_STORAGE_KEY, address);
  connectedPublicKey.set(address);
  void checkAndNotifyFunding(address);
}

export function disconnect(): void {
  localStorage.removeItem(WALLET_STORAGE_KEY);
  connectedPublicKey.set(undefined);
}

/** Let the user pick a wallet; resolves with its address. */
export async function connect(): Promise<string> {
  const { address } = await (await kit()).authModal();
  setConnection(address);
  return address;
}

/**
 * Follow the wallet: the user may have switched accounts in it since the
 * address was stored. Forgets the connection when the wallet is gone.
 */
export async function followWallet(): Promise<void> {
  const stored = loadedPublicKey();
  try {
    if (!stored) return;
    const { address } = await (await kit()).getAddress();
    if (!address) disconnect();
    else if (address !== stored) setConnection(address);
  } catch {
    disconnect();
  } finally {
    walletInitialized.set(true);
  }
}

/** Offer to fund an account that does not exist yet or holds under 1 XLM. */
async function checkAndNotifyFunding(address: string): Promise<void> {
  // Horizon does not know smart accounts, and their relayer pays the fees.
  if (StrKey.isValidContract(address)) return;
  try {
    const account = await horizonAccount(address);
    if (!account || account.balance < 1) {
      const network = /Test/i.test(
        import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
      )
        ? "testnet"
        : "mainnet";
      openModal("funding", {
        exists: !!account,
        balance: account?.balance ?? 0,
        network,
      });
    }
  } catch {
    // Best effort.
  }
}

/**
 * A classic account's sequence number and XLM balance, from Horizon; `null`
 * when the network does not know it: never funded, or another network's.
 */
export async function horizonAccount(
  address: string,
): Promise<{ sequence: string; balance: number } | null> {
  const resp = await fetchWithin(
    `${import.meta.env.PUBLIC_HORIZON_URL}/accounts/${address}`,
    { headers: { Accept: "application/json" } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Horizon error ${resp.status}`);
  const { sequence, balances = [] } = await resp.json();
  const native = balances.find((b: any) => b.asset_type === "native");
  return { sequence, balance: native ? Number(native.balance) : 0 };
}
