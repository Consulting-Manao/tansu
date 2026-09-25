/**
 * The one write path: sign a contract call once, land it, refetch what it
 * changed. Donations, classic payments, sign through the same wallet.
 */
import * as StellarSdk from "@stellar/stellar-sdk";
import type { QueryKey } from "@tanstack/react-query";
import { rpcServer } from "../contracts/soroban_tansu";
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

/** A call that landed: its result, as the binding types it, and its hash. */
export interface Landed<T> {
  result: T;
  hash: string;
}

/** When a transaction can last land (Unix seconds); 0 when it has no bound. */
const maxTimeOf = (tx: StellarSdk.Transaction | undefined) =>
  Number(tx?.timeBounds?.maxTime ?? 0);

/**
 * Wait for a transaction to be in a ledger, and read its result. Network
 * errors do not end the wait: it lasts until the transaction's time bound has
 * passed, after which it can no longer land. Only then does it say whether it
 * expired, or that its status is unknown and must be checked before a retry.
 */
async function awaitLanding(
  hash: string,
  maxTime: number,
): Promise<StellarSdk.rpc.Api.GetSuccessfulTransactionResponse> {
  // Past the bound, a ledger or two settles it.
  const settled =
    (maxTime > 0 ? maxTime * 1000 : Date.now() + 5 * 60_000) + 15_000;
  for (;;) {
    let response: StellarSdk.rpc.Api.GetTransactionResponse | undefined;
    try {
      response = await rpcServer.getTransaction(hash);
    } catch {
      response = undefined;
    }
    if (response?.status === "SUCCESS") return response;
    if (response?.status === "FAILED") {
      throw new Error(`Transaction ${hash} failed on-chain.`);
    }
    if (Date.now() > settled) {
      throw new Error(
        response
          ? `Transaction ${hash} expired without landing: nothing changed, you can try again.`
          : `The status of transaction ${hash} could not be read: check it on a Stellar explorer before trying again.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

/** Wait for a contract call to land, and read its result. */
async function confirm<T>(
  tx: StellarSdk.contract.AssembledTransaction<T>,
  hash: string,
  maxTime: number,
): Promise<Landed<T>> {
  const { returnValue } = await awaitLanding(hash, maxTime);
  const value = returnValue ?? StellarSdk.xdr.ScVal.scvVoid();
  return { result: tx.options.parseResultXdr(value), hash };
}

/**
 * What the wallet is asked to authorize: the Tansu call and, as collateral,
 * XLM transfers to Tansu. A contract a proposal names, or any other, gets
 * nothing signed on the member's behalf.
 */
export function checkAuthorization(
  tx: StellarSdk.contract.AssembledTransaction<unknown>,
): void {
  const tansu = import.meta.env.PUBLIC_TANSU_CONTRACT_ID;
  const xlm = StellarSdk.Asset.native().contractId(NETWORK_PASSPHRASE);
  const check = (
    invocation: StellarSdk.xdr.SorobanAuthorizedInvocation,
    root: boolean,
  ): void => {
    const call =
      invocation.function.type === "sorobanAuthorizedFunctionTypeContractFn"
        ? invocation.function.contractFn
        : undefined;
    const contract = call
      ? StellarSdk.Address.fromScAddress(call.contractAddress).toString()
      : "a contract creation";
    const fn = call ? String(call.functionName) : "";
    const allowed = root
      ? contract === tansu
      : contract === xlm &&
        fn === "transfer" &&
        StellarSdk.scValToNative(call!.args[1]!) === tansu;
    if (!allowed) {
      throw new Error(
        `This transaction would also authorize ${fn ? `${fn} on ` : ""}${contract}, so it is not signed.`,
      );
    }
    invocation.subInvocations.forEach((sub) => check(sub, false));
  };
  for (const entry of tx.simulationData.result.auth) {
    check(entry.rootInvocation, true);
  }
}

/**
 * Send a signed envelope; returns its hash and when it can last land. The
 * network takes it at once and includes it later.
 */
async function send(xdr: string): Promise<{ hash: string; maxTime: number }> {
  const envelope = StellarSdk.TransactionBuilder.fromXDR(
    xdr,
    NETWORK_PASSPHRASE,
  );
  const sent = await retryAsync(() => rpcServer.sendTransaction(envelope));
  if (sent.status === "ERROR") {
    const code = sent.errorResult?.result.type ?? "error";
    throw new Error(`The network rejected the transaction (${code}).`);
  }
  if (sent.status === "TRY_AGAIN_LATER") {
    throw new Error("The network is busy: try again in a moment.");
  }
  return {
    hash: sent.hash,
    maxTime: maxTimeOf(
      envelope instanceof StellarSdk.Transaction ? envelope : undefined,
    ),
  };
}

/** Submit a signed contract call and wait for its result. */
async function submit<T>(
  tx: StellarSdk.contract.AssembledTransaction<T>,
  xdr: string,
): Promise<Landed<T>> {
  const { hash, maxTime } = await send(xdr);
  return confirm(tx, hash, maxTime);
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
  checkAuthorization(tx);
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
    return "hash" in signed
      ? confirm(tx, signed.hash, maxTimeOf(tx.built))
      : submit(tx, signed.xdr);
  }

  if ("hash" in signed) {
    const landed = await confirm(tx, signed.hash, maxTimeOf(tx.built));
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

/** A donation's message: a text memo holds 28 bytes. */
export const MEMO_BYTES = 28;

/**
 * Donate `amount` XLM (a decimal string) to Tansu, with an optional message:
 * a classic payment, sent and confirmed like a contract call. Throws what to
 * tell the user.
 */
export async function sendXLM(amount: string, message: string): Promise<void> {
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
  const transaction = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(sender, account.sequence),
    { fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE },
  )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: import.meta.env.PUBLIC_TANSU_OWNER_ID,
        asset: StellarSdk.Asset.native(),
        amount,
      }),
    )
    .addMemo(message ? StellarSdk.Memo.text(message) : StellarSdk.Memo.none())
    .setTimeout(180)
    .build();

  const signed = await sign(transaction.toXDR(), sender);
  if (!("xdr" in signed)) {
    throw new Error("The wallet submitted the payment instead of signing it");
  }
  const { hash, maxTime } = await send(signed.xdr);
  await awaitLanding(hash, maxTime);
}
