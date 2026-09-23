import { retryAsync } from "../utils/retry";
import { parseContractError } from "../utils/contractErrors";
import * as StellarSdk from "@stellar/stellar-sdk";
import { toast } from "utils/utils";
import { disconnect, loadedPublicKey } from "./walletService";

// Freighter kept ONLY as legacy fallback — not the primary signer
import freighterPkg from "@stellar/freighter-api";
const {
  isConnected,
  requestAccess,
  signTransaction: freighterSign,
} = freighterPkg;

const NETWORK_PASSPHRASE = import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE;

async function withActiveWallet<T>({
  kitAction,
  freighterAction,
  fallbackErrorMessage,
}: {
  kitAction: (StellarWalletsKit: any) => Promise<T>;
  freighterAction: () => Promise<T>;
  fallbackErrorMessage: string;
}): Promise<T> {
  try {
    const { StellarWalletsKit } =
      await import("../components/stellar-wallets-kit");
    return await kitAction(StellarWalletsKit);
  } catch (kitErr: any) {
    const errMsg = kitErr?.message || "";
    if (errMsg.includes("no wallet") || errMsg.includes("wallet not set")) {
      try {
        return await freighterAction();
      } catch {
        throw new Error(fallbackErrorMessage);
      }
    }
    throw kitErr;
  }
}

/**
 * A signed envelope to submit, or the hash of a transaction the wallet
 * submitted itself (Nido relays smart-account transactions).
 */
export type SignedTransaction = { xdr: string } | { hash: string };

// `error.name` Nido rejects with when the user picks "Use a different account".
const ACCOUNT_SWITCH_REQUESTED = "ACCOUNT_SWITCH_REQUESTED";

/**
 * Sign a transaction XDR using whichever wallet is currently active in the kit.
 * Falls back to Freighter's direct API only if the kit has no active wallet set.
 */
async function signWithActiveWallet(
  xdr: string,
  address: string | undefined = loadedPublicKey(),
): Promise<SignedTransaction> {
  return withActiveWallet<SignedTransaction>({
    kitAction: async (StellarWalletsKit) => {
      let result: { signedTxXdr?: string; submitted?: boolean };
      try {
        result = await StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address,
        });
      } catch (err: any) {
        if (err?.name === ACCOUNT_SWITCH_REQUESTED) {
          disconnect();
          throw new Error(
            "Connect again, pick the account you want, then retry.",
            { cause: err },
          );
        }
        throw err;
      }
      const { signedTxXdr, submitted } = result;
      if (!signedTxXdr) {
        throw new Error("signedTxXdr returned from wallet is undefined.");
      }
      // A wallet that submitted the transaction returns its hash instead.
      return submitted === true ? { hash: signedTxXdr } : { xdr: signedTxXdr };
    },
    freighterAction: async () => {
      const signedResp = await freighterSign(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      const signedTxXdr =
        typeof signedResp === "string"
          ? signedResp
          : ((signedResp as any)?.signedTxXdr ?? (signedResp as any)?.xdr);
      if (!signedTxXdr) {
        throw new Error("signedTxXdr returned from wallet is undefined.");
      }
      return { xdr: signedTxXdr };
    },
    fallbackErrorMessage: "Failed to get signed transaction XDR",
  });
}

/**
 * Decode Soroban transaction return values
 */
export async function decodeReturnValue(returnValue: any): Promise<any> {
  if (returnValue === undefined) return true;
  if (typeof returnValue === "number" || typeof returnValue === "boolean")
    return returnValue;

  try {
    const { xdr, scValToNative } = StellarSdk;
    let decoded: any;

    if (typeof returnValue === "string") {
      const scVal = xdr.ScVal.fromXdr(returnValue, "base64");
      decoded = scValToNative(scVal);
    } else {
      decoded = scValToNative(returnValue);
    }

    if (typeof decoded === "bigint") return Number(decoded);
    if (typeof decoded === "number" || typeof decoded === "boolean")
      return decoded;

    const coerced = Number(decoded);
    return isNaN(coerced) ? decoded : coerced;
  } catch (_) {
    return true;
  }
}

/**
 * Wait for a submitted transaction to leave NOT_FOUND and decode its return
 * value.
 */
async function waitForTransaction(
  server: StellarSdk.rpc.Server,
  hash: string,
): Promise<any> {
  let retries = 0;
  let getResponse = await server.getTransaction(hash);
  const maxRetries = 30;

  while (getResponse.status === "NOT_FOUND" && retries < maxRetries) {
    await new Promise((res) => setTimeout(res, 1000));
    getResponse = await server.getTransaction(hash);
    retries++;
  }

  if (getResponse.status === "SUCCESS")
    return decodeReturnValue(getResponse.returnValue);

  if (getResponse.status === "FAILED") {
    const errStr = JSON.stringify(getResponse);
    const match = errStr.match(/Error\(Contract, #(\d+)\)/);
    if (match) throw new Error(parseContractError({ message: errStr } as any));
    throw new Error(`Transaction failed with status: ${getResponse.status}`);
  }

  throw new Error(`Transaction failed with status: ${getResponse.status}`);
}

/**
 * Send a signed transaction (Soroban) and decode typical return values.
 * - Accepts base64 XDR directly (soroban-rpc supports it)
 * - Falls back to classic Transaction envelope when necessary
 * - Waits for PENDING → SUCCESS/FAILED and attempts returnValue decoding
 * - A transaction the wallet already submitted is only awaited
 */
export async function sendSignedTransaction(
  signed: SignedTransaction,
): Promise<any> {
  const { rpc } = StellarSdk;
  const server = new rpc.Server(import.meta.env.PUBLIC_SOROBAN_RPC_URL);

  if ("hash" in signed) return waitForTransaction(server, signed.hash);
  const signedTxXdr = signed.xdr;

  let sendResponse: any;
  try {
    //Deserialize XDR string back into a Transaction object
    const tx = StellarSdk.TransactionBuilder.fromXdr(
      signedTxXdr,
      import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
    );
    sendResponse = await retryAsync(() => (server as any).sendTransaction(tx));
  } catch (err: any) {
    console.error("Soroban sendTransaction error:", err);
    throw new Error(
      "Failed to send Soroban transaction: " + (err?.message || err),
      { cause: err },
    );
  }

  if (sendResponse.status === "ERROR") {
    const errStr = JSON.stringify(sendResponse.errorResult);
    const match = errStr.match(/Error\(Contract, #(\d+)\)/);
    if (match) throw new Error(parseContractError({ message: errStr } as any));
    throw new Error(`Transaction failed: ${errStr}`);
  }

  if (sendResponse.status === "SUCCESS")
    return decodeReturnValue(sendResponse.returnValue);

  if (sendResponse.status === "PENDING")
    return waitForTransaction(server, sendResponse.hash);

  return sendResponse;
}

/**
 * Send XLM payment transaction (Stellar classic, not Soroban)
 * Used for donations and tips
 */
export async function sendXLM(
  donateAmount: string,
  projectAddress: string,
  tipAmount: string,
  donateMessage: string,
): Promise<boolean> {
  try {
    // Try kit first; if no wallet is set, fall back to Freighter check
    let senderPublicKey: string | undefined;

    try {
      const { StellarWalletsKit } =
        await import("../components/stellar-wallets-kit");
      const { address } = await StellarWalletsKit.getAddress();
      senderPublicKey = address;
    } catch {
      // Kit has no wallet — try Freighter legacy path
      const connectedResult = await isConnected();
      const walletConnected =
        typeof connectedResult === "boolean"
          ? connectedResult
          : (connectedResult as any)?.isConnected === true;

      if (!walletConnected) throw new Error("WALLET_NOT_CONNECTED");

      // requestAccess() returns { publicKey: string } — handle both shapes
      const accessResult = await requestAccess();
      senderPublicKey =
        typeof accessResult === "string"
          ? accessResult
          : ((accessResult as any)?.publicKey ??
            (accessResult as any)?.address);
    }

    if (!senderPublicKey) throw new Error("WALLET_NOT_CONNECTED");
    if (StellarSdk.StrKey.isValidContract(senderPublicKey)) {
      throw new Error(
        "Donations are classic XLM payments, which smart-account wallets such as Nido cannot send. Connect a G… account to donate.",
      );
    }

    const horizonUrl = import.meta.env.PUBLIC_HORIZON_URL;

    const accountResp = await fetch(
      `${horizonUrl}/accounts/${senderPublicKey}`,
      { headers: { Accept: "application/json" } },
    );
    // Detect unfunded or wrong-network wallets
    if (!accountResp.ok) throw new Error("WALLET_UNFUNDED_OR_WRONG_NETWORK");

    const accountJson = await accountResp.json();
    const account = new StellarSdk.Account(
      senderPublicKey,
      accountJson.sequence,
    );

    // Build the payment transaction
    const txBuilder = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: projectAddress,
          asset: StellarSdk.Asset.native(),
          amount: donateAmount,
        }),
      )
      .addMemo(StellarSdk.Memo.text(donateMessage));

    // Optional platform tip
    if (Number(tipAmount) > 0) {
      txBuilder.addOperation(
        StellarSdk.Operation.payment({
          destination: import.meta.env.PUBLIC_TANSU_OWNER_ID,
          asset: StellarSdk.Asset.native(),
          amount: tipAmount,
        }),
      );
    }

    const transaction = txBuilder
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    // Sign and extract the raw XDR — handle both old and new signTransaction response shapes
    const signed = await signWithActiveWallet(
      transaction.toXdr(),
      senderPublicKey,
    );
    if (!("xdr" in signed)) {
      throw new Error("The wallet submitted the payment instead of signing it");
    }

    const response = await fetch(`${horizonUrl}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(signed.xdr)}`,
    });

    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    return result?.successful === true;
  } catch (error: any) {
    const msg = error?.message || "Unknown error";
    toast.error("Transaction Failed", msg);
    return false;
  }
}

/**
 * Sign an assembled Soroban transaction
 */
export async function signAssembledTransaction(
  assembledTx: any,
): Promise<SignedTransaction> {
  const sim = await assembledTx.simulate();
  if ((assembledTx as any).prepare) await (assembledTx as any).prepare(sim);

  const preparedXdr = assembledTx.toXdr();

  // Sign and extract XDR
  return await signWithActiveWallet(preparedXdr);
}

/**
 * Convenience helper that signs an assembled transaction and sends it to the network.
 */
export async function signAndSend(assembledTx: any): Promise<any> {
  const signed = await signAssembledTransaction(assembledTx);
  return await sendSignedTransaction(signed);
}
