import { connectedPublicKey, walletInitialized } from "utils/store";

interface ConnectionState {
  publicKey: string | undefined;
}

const connectionState: ConnectionState = {
  publicKey: undefined,
};

function loadedPublicKey(): string | undefined {
  return connectionState.publicKey;
}

function setConnection(publicKey: string): void {
  connectionState.publicKey = publicKey;

  localStorage.setItem("publicKey", publicKey);

  connectedPublicKey.set(publicKey);
}
function disconnect(): void {
  connectionState.publicKey = undefined;

  localStorage.removeItem("publicKey");

  connectedPublicKey.set(undefined);
}

export async function checkAndNotifyFunding(): Promise<void> {
  if (import.meta.env.MODE === "test") return;

  const publicKey = loadedPublicKey();
  if (!publicKey) return;

  try {
    const { exists, balance } = await getWalletHealth();

    const minRequired = 1;
    const networkPass = import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE || "";

    const network = /Test/i.test(networkPass) ? "testnet" : "mainnet";

    if (!exists || balance < minRequired) {
      window.dispatchEvent(
        new CustomEvent("openFundingModal", {
          detail: { exists, balance, network },
        }),
      );
    }
  } catch (_) {
    // Funding check is best-effort; swallow errors silently
  }
}

async function initializeConnection(): Promise<void> {
  const storedPublicKey = localStorage.getItem("publicKey");

  if (storedPublicKey) {
    connectionState.publicKey = storedPublicKey;
    connectedPublicKey.set(storedPublicKey);
  }

  if (import.meta.env.MODE === "test" || !storedPublicKey) {
    walletInitialized.set(true);
    return;
  }

  try {
    const { StellarWalletsKit } = await import(
      "../components/stellar-wallets-kit"
    );
    const { address } = await StellarWalletsKit.getAddress();

    if (address && address !== storedPublicKey) {
      setConnection(address);
    } else if (!address) {
      disconnect();
    }
  } catch {
    disconnect();
  } finally {
    walletInitialized.set(true);
  }
}

/**
 * Check if the connected wallet exists and has funds.
 * Returns { exists: boolean, balance: number }.
 */
async function getWalletHealth(): Promise<{
  exists: boolean;
  balance: number;
}> {
  const publicKey = loadedPublicKey();
  const horizonUrl = import.meta.env.PUBLIC_HORIZON_URL;

  if (!publicKey) return { exists: false, balance: 0 };

  try {
    const resp = await fetch(`${horizonUrl}/accounts/${publicKey}`, {
      headers: { Accept: "application/json" },
    });

    if (resp.status === 404) {
      // Account not found on this network
      return { exists: false, balance: 0 };
    }

    if (!resp.ok) {
      console.warn(`Unexpected Horizon response: ${resp.status}`);
      return { exists: false, balance: 0 };
    }

    const json = await resp.json();
    const native = (json.balances || []).find(
      (b: any) => b.asset_type === "native",
    );
    const balance = native ? Number(native.balance) : 0;

    return { exists: true, balance };
  } catch (error) {
    console.error("Error checking wallet health:", error);
    return { exists: false, balance: 0 };
  }
}

export {
  loadedPublicKey,
  setConnection,
  disconnect,
  initializeConnection,
  getWalletHealth,
};
