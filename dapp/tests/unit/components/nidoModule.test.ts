/**
 * The patch on @nidohq/stellar-wallets-kit-module (patches/): Nido's sign
 * page relays a smart-account transaction and returns its hash as
 * `nido_submitted`, which the published 0.1.0 reports as "no result".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountOrigin,
  NidoModule,
  saveCachedAddress,
} from "@nidohq/stellar-wallets-kit-module";

const BASE = "https://nido.fyi";
const ACCOUNT = "CA2JKAD2ZFT3HY7GHKEIEBEOHIPEPGZADICR7ISOXUSAXX63SFSJ4KBO";

/** A browser whose Nido popup answers with the query string `search`. */
function popupAnswering(search: string) {
  const store = new Map<string, string>();
  let onMessage: ((event: unknown) => void) | undefined;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  vi.stubGlobal("window", {
    location: { origin: "https://testnet.tansu.dev", href: "https://x/" },
    addEventListener: (_: string, listener: (event: unknown) => void) => {
      onMessage = listener;
    },
    removeEventListener: () => {},
    open: () => {
      queueMicrotask(() =>
        onMessage?.({
          origin: accountOrigin(BASE, ACCOUNT),
          data: { source: "nido-wallet", search },
        }),
      );
      return { closed: false, close: () => {} };
    },
  });
  saveCachedAddress(ACCOUNT);
}

describe("NidoModule.signTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the hash of a transaction the relayer submitted", async () => {
    popupAnswering("?nido_submitted=ae81f753&kind=tx");
    const nido = new NidoModule({ base: BASE });
    await expect(nido.signTransaction("AAAA")).resolves.toEqual({
      signedTxXdr: "ae81f753",
      signerAddress: ACCOUNT,
      submitted: true,
    });
  });

  it("returns a signed envelope as before", async () => {
    popupAnswering("?nido_signed=AAAB&kind=tx");
    const nido = new NidoModule({ base: BASE });
    await expect(nido.signTransaction("AAAA")).resolves.toEqual({
      signedTxXdr: "AAAB",
      signerAddress: ACCOUNT,
    });
  });
});
