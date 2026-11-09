/**
 * The contract's storage read straight from the ledger, for the getters that
 * only return an entry: a ledger read answers in a fraction of a second,
 * where a simulation takes seconds. Every read asked for within 10 ms
 * shares one `getLedgerEntries` call. This ties the dApp to the contract's
 * storage keys and types (`ProjectKey` in `contracts/tansu/src/types.rs`):
 * a contract change to them changes the readers here too.
 */
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { rpcServer, tansuReads } from "../contracts/soroban_tansu";

/** A key of the contract's storage: its `ProjectKey` variant, then fields. */
export const storageKey = (variant: string, ...fields: xdr.ScVal[]) =>
  xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), ...fields]);

/** A value of one of the contract's types, as its getter returns it. */
export const decode = <T>(value: xdr.ScVal, type: string): T =>
  tansuReads.spec.scValToNative(
    value,
    xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: type })),
  ) as T;

/** The RPC reads at most this many ledger entries per call. */
const KEYS_PER_READ = 200;

interface Wanted {
  key: xdr.LedgerKey;
  temporary: boolean;
  waiters: {
    resolve: (value: xdr.ScVal | undefined) => void;
    reject: (error: unknown) => void;
  }[];
}

let wanted: Map<string, Wanted> | null = null;

function flush() {
  const batch = [...wanted!.entries()];
  wanted = null;
  for (let i = 0; i < batch.length; i += KEYS_PER_READ) {
    const chunk = batch.slice(i, i + KEYS_PER_READ);
    rpcServer.getLedgerEntries(...chunk.map(([, { key }]) => key)).then(
      ({ entries, latestLedger }) => {
        const found = new Map(
          entries.map((entry) => [entry.key.toXdr("base64"), entry]),
        );
        for (const [id, { temporary, waiters }] of chunk) {
          const entry = found.get(id);
          // A temporary entry past its TTL is gone for the contract too.
          const expired =
            temporary &&
            entry?.liveUntilLedgerSeq !== undefined &&
            entry.liveUntilLedgerSeq < latestLedger;
          const value =
            entry?.val.type === "contractData" && !expired
              ? entry.val.contractData.val
              : undefined;
          for (const waiter of waiters) waiter.resolve(value);
        }
      },
      (error) => {
        for (const [, { waiters }] of chunk) {
          for (const waiter of waiters) waiter.reject(error);
        }
      },
    );
  }
}

/**
 * The value the contract keeps under `key`; `undefined` when there is none,
 * or a temporary one past its TTL.
 */
export function readEntry(
  key: xdr.ScVal,
  temporary = false,
): Promise<xdr.ScVal | undefined> {
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(
        import.meta.env.PUBLIC_TANSU_CONTRACT_ID,
      ).toScAddress(),
      key,
      durability: temporary
        ? xdr.ContractDataDurability.temporary
        : xdr.ContractDataDurability.persistent,
    }),
  );
  const id = ledgerKey.toXdr("base64");
  if (!wanted) {
    wanted = new Map();
    // A few milliseconds more, and the page's islands ask in the same call.
    setTimeout(flush, 10);
  }
  return new Promise((resolve, reject) => {
    const entry = wanted!.get(id) ?? { key: ledgerKey, temporary, waiters: [] };
    entry.waiters.push({ resolve, reject });
    wanted!.set(id, entry);
  });
}

/** A persistent value of a plain type, as JavaScript; `undefined` if none. */
export async function readStorage(key: xdr.ScVal): Promise<unknown> {
  const value = await readEntry(key);
  return value && scValToNative(value);
}
