/**
 * The one write path: sign a contract call once, land it, refetch what it
 * changed. Donations, classic payments, sign through the same wallet.
 */
import * as StellarSdk from "@stellar/stellar-sdk";
import type { QueryKey } from "@tanstack/react-query";
import { checkSimulationError } from "../utils/contractErrors";
import {
  ipfsQuery,
  packFilesToCar,
  uploadToIpfsProxy,
} from "../utils/ipfsFunctions";
import { retryAsync } from "../utils/retry";
import { invalidateAfter, queryClient } from "./queryClient";
import {
  connectedAddress,
  disconnect,
  horizonAccount,
  loadedPublicKey,
} from "./walletService";

const NETWORK_PASSPHRASE = import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE;

/**
 * A signed envelope to submit, or the hash of a transaction the wallet
 * submitted itself (Nido relays smart-account transactions).
 */
type Signed = { xdr: string } | { hash: string };

// `error.name` Nido rejects with when the user picks "Use a different account".
const ACCOUNT_SWITCH_REQUESTED = "ACCOUNT_SWITCH_REQUESTED";

/** Sign with the wallet the user connected. */
async function sign(
  xdr: string,
  address: string | undefined = loadedPublicKey(),
): Promise<Signed> {
  const { StellarWalletsKit } =
    await import("../components/stellar-wallets-kit");
  let result: { signedTxXdr?: string; submitted?: boolean };
  try {
    result = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
      ...(address ? { address } : {}),
    });
  } catch (err: any) {
    if (err?.name === ACCOUNT_SWITCH_REQUESTED) {
      disconnect();
      throw new Error("Connect again, pick the account you want, then retry.", {
        cause: err,
      });
    }
    throw err;
  }
  const { signedTxXdr, submitted } = result;
  if (!signedTxXdr) {
    throw new Error("The wallet returned no signed transaction.");
  }
  // A wallet that submitted the transaction returns its hash instead.
  return submitted === true ? { hash: signedTxXdr } : { xdr: signedTxXdr };
}

const server = () =>
  new StellarSdk.rpc.Server(import.meta.env.PUBLIC_SOROBAN_RPC_URL, {
    allowHttp: import.meta.env.DEV,
  });

/** A call that landed: its result, as the binding types it, and its hash. */
export interface Landed<T> {
  result: T;
  hash: string;
}

/** Wait for a transaction to be in a ledger, and read its result. */
async function confirm<T>(
  tx: StellarSdk.contract.AssembledTransaction<T>,
  hash: string,
): Promise<Landed<T>> {
  const response = await server().pollTransaction(hash, { attempts: 30 });
  if (response.status === "SUCCESS") {
    const value = response.returnValue ?? StellarSdk.xdr.ScVal.scvVoid();
    return { result: tx.options.parseResultXdr(value), hash };
  }
  if (response.status === "FAILED") {
    throw new Error(`Transaction ${hash} failed on-chain.`);
  }
  throw new Error(`Transaction ${hash} was not confirmed in time.`);
}

/** Submit a signed envelope and wait for it. */
async function submit<T>(
  tx: StellarSdk.contract.AssembledTransaction<T>,
  xdr: string,
): Promise<Landed<T>> {
  const envelope = StellarSdk.TransactionBuilder.fromXDR(
    xdr,
    NETWORK_PASSPHRASE,
  );
  const sent = await retryAsync(() => server().sendTransaction(envelope));
  if (sent.status === "ERROR") {
    const code = sent.errorResult?.result.type ?? "error";
    throw new Error(`The network rejected the transaction (${code}).`);
  }
  if (sent.status === "TRY_AGAIN_LATER") {
    throw new Error("The network is busy: try again in a moment.");
  }
  return confirm(tx, sent.hash);
}

/** Files packed for a call to point to, by their directory's CID. */
export interface Upload {
  cid: string;
  carBlob: Blob;
}

/**
 * Pack files into one IPFS directory. Content under a CID never changes, so
 * its text files show at once when the call lands, without asking a gateway
 * that may not serve them yet.
 */
export async function packUpload(files: File[]): Promise<Upload> {
  const upload = await packFilesToCar(files);
  for (const file of files) {
    if (/\.(toml|md|json)$/.test(file.name)) {
      queryClient.setQueryData(
        ipfsQuery(upload.cid, file.name).queryKey,
        await file.text(),
      );
    }
  }
  return upload;
}

export interface SendOptions {
  /** IPFS content the call points to, uploaded as it lands. */
  upload?: Upload | undefined;
  /** The queries the call changes, refetched once it settles. */
  invalidate?: QueryKey[];
  /** Flow steps: 8 uploading, 9 sending. */
  onProgress?: ((step: number) => void) | undefined;
}

/**
 * Sign a contract call once and land it, in the order the wallet allows. A
 * signed envelope authorizes the IPFS upload, then is sent. A transaction the
 * wallet submitted itself is confirmed first, and its hash authorizes the
 * upload. `uploadToIpfsProxy` checks the uploaded CID either way. The queries
 * the call changes are refetched even when it failed: it may have landed.
 */
export async function sendTransaction<T>(
  tx: StellarSdk.contract.AssembledTransaction<T>,
  { upload, invalidate = [], onProgress }: SendOptions = {},
): Promise<Landed<T>> {
  // A contract error shows before the wallet is asked to sign.
  checkSimulationError(tx);
  const signed = await sign(tx.toXDR());
  return invalidateAfter(land(tx, signed, upload, onProgress), ...invalidate);
}

async function land<T>(
  tx: StellarSdk.contract.AssembledTransaction<T>,
  signed: Signed,
  upload: SendOptions["upload"],
  onProgress: SendOptions["onProgress"],
): Promise<Landed<T>> {
  if (!upload) {
    onProgress?.(9);
    return "hash" in signed ? confirm(tx, signed.hash) : submit(tx, signed.xdr);
  }

  if ("hash" in signed) {
    const landed = await confirm(tx, signed.hash);
    onProgress?.(8);
    try {
      await uploadToIpfsProxy({ ...upload, txHash: signed.hash });
    } catch (error: any) {
      throw new Error(
        `Transaction ${signed.hash} is on-chain but its IPFS upload failed: ${error?.message ?? error}`,
        { cause: error },
      );
    }
    onProgress?.(9);
    return landed;
  }

  onProgress?.(8);
  await uploadToIpfsProxy({ ...upload, signedTxXdr: signed.xdr });
  onProgress?.(9);
  return submit(tx, signed.xdr);
}

/**
 * Donate XLM, with an optional tip to Tansu: a classic payment, sent through
 * Horizon. Throws what to tell the user.
 */
export async function sendXLM(
  donateAmount: string,
  projectAddress: string,
  tipAmount: string,
  donateMessage: string,
): Promise<void> {
  const sender = connectedAddress();
  if (StellarSdk.StrKey.isValidContract(sender)) {
    throw new Error(
      "Donations are classic XLM payments, which smart-account wallets such as Nido cannot send. Connect a G… account to donate.",
    );
  }
  const account = await horizonAccount(sender);
  if (!account) {
    throw new Error(
      "Your account does not exist on this network yet: fund it, then donate.",
    );
  }

  const txBuilder = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(sender, account.sequence),
    { fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE },
  )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: projectAddress,
        asset: StellarSdk.Asset.native(),
        amount: donateAmount,
      }),
    )
    .addMemo(StellarSdk.Memo.text(donateMessage));
  if (Number(tipAmount) > 0) {
    txBuilder.addOperation(
      StellarSdk.Operation.payment({
        destination: import.meta.env.PUBLIC_TANSU_OWNER_ID,
        asset: StellarSdk.Asset.native(),
        amount: tipAmount,
      }),
    );
  }
  const transaction = txBuilder.setTimeout(StellarSdk.TimeoutInfinite).build();

  const signed = await sign(transaction.toXDR(), sender);
  if (!("xdr" in signed)) {
    throw new Error("The wallet submitted the payment instead of signing it");
  }
  const response = await fetch(
    `${import.meta.env.PUBLIC_HORIZON_URL}/transactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(signed.xdr)}`,
    },
  );
  if (!response.ok) throw new Error(await response.text());
}
