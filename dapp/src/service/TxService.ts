import { retryAsync } from "../utils/retry";
import { parseContractError } from "../utils/contractErrors";
import * as StellarSdk from "@stellar/stellar-sdk";
import { toast } from "utils/utils";

// Correct CommonJS import for Freighter
import freighterPkg from "@stellar/freighter-api";
const { isConnected, requestAccess, signTransaction } = freighterPkg;

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
      const scVal = xdr.ScVal.fromXDR(returnValue, "base64");
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
 * Send a signed transaction (Soroban) and decode typical return values.
 * - Accepts base64 XDR directly (soroban-rpc supports it)
 * - Falls back to classic Transaction envelope when necessary
 * - Waits for PENDING → SUCCESS/FAILED and attempts returnValue decoding
 */
export async function sendSignedTransaction(signedTxXdr: string): Promise<any> {
  const { rpc } = StellarSdk;
  const server = new rpc.Server(import.meta.env.PUBLIC_SOROBAN_RPC_URL);

  let sendResponse: any;
  try {
    //Deserialize XDR string back into a Transaction object
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      signedTxXdr,
      import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
    );

    sendResponse = await retryAsync(() => (server as any).sendTransaction(tx));
  } catch (err: any) {
    console.error("Soroban sendTransaction error:", err);
    throw new Error(
      "Failed to send Soroban transaction: " + (err?.message || err),
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

  if (sendResponse.status === "PENDING") {
    let retries = 0;
    let getResponse = await server.getTransaction(sendResponse.hash);
    const maxRetries = 30;

    while (getResponse.status === "NOT_FOUND" && retries < maxRetries) {
      await new Promise((res) => setTimeout(res, 1000));
      getResponse = await server.getTransaction(sendResponse.hash);
      retries++;
    }

    if (getResponse.status === "SUCCESS")
      return decodeReturnValue(getResponse.returnValue);

    if (getResponse.status === "FAILED") {
      const errStr = JSON.stringify(getResponse);
      const match = errStr.match(/Error\(Contract, #(\d+)\)/);
      if (match)
        throw new Error(parseContractError({ message: errStr } as any));
      throw new Error(`Transaction failed with status: ${getResponse.status}`);
    }

    throw new Error(`Transaction failed with status: ${getResponse.status}`);
  }

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
    // Freighter's isConnected() returns { isConnected: boolean } in newer versions
    const connectedResult = await isConnected();
    const walletConnected =
      typeof connectedResult === "boolean"
        ? connectedResult
        : (connectedResult as any)?.isConnected === true;

    if (!walletConnected) throw new Error("WALLET_NOT_CONNECTED");

    // requestAccess() returns { publicKey: string } — handle both shapes
    const accessResult = await requestAccess();
    const senderPublicKey =
      typeof accessResult === "string"
        ? accessResult
        : (accessResult as any)?.publicKey || (accessResult as any)?.address;

    if (!senderPublicKey) throw new Error("WALLET_NOT_CONNECTED");

    const horizonUrl = import.meta.env.PUBLIC_HORIZON_URL;

    const accountResp = await fetch(
      `${horizonUrl}/accounts/${senderPublicKey}`,
      {
        headers: { Accept: "application/json" },
      },
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
    const signedTxResponse = await signTransaction(transaction.toXDR(), {
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });
    const signedTx =
      typeof signedTxResponse === "string"
        ? signedTxResponse
        : (signedTxResponse as any)?.signedTxXdr ||
          (signedTxResponse as any)?.xdr;

    if (!signedTx) throw new Error("Failed to get signed transaction XDR");

    const response = await fetch(`${horizonUrl}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(signedTx)}`,
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
): Promise<string> {
  const sim = await assembledTx.simulate();
  if ((assembledTx as any).prepare) await (assembledTx as any).prepare(sim);

  const preparedXdr = assembledTx.toXDR();

  // Sign and extract XDR
  const signedResp = await signTransaction(preparedXdr, {
    networkPassphrase: import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
  });

  return signedResp.signedTxXdr;
}

/**
 * Convenience helper that signs an assembled transaction and sends it to the network.
 */
export async function signAndSend(assembledTx: any): Promise<any> {
  const signed = await signAssembledTransaction(assembledTx);
  return await sendSignedTransaction(signed);
}

/**
 * Optional helper to detect Stellar network errors
 */
export function isStellarNetworkError(error: any): boolean {
  if (!error) return false;
  const errStr = (
    typeof error === "string" ? error : error.message || ""
  ).toLowerCase();
  const patterns = ["op_underfunded", "tx_insufficient_fee", "tx_bad_seq"];
  return patterns.some((p) => errStr.includes(p));
}
