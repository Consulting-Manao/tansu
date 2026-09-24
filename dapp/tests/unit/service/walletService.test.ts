import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authModalMock } = vi.hoisted(() => ({ authModalMock: vi.fn() }));
vi.mock("../../../src/components/stellar-wallets-kit", () => ({
  StellarWalletsKit: { authModal: authModalMock },
}));

import { connect } from "../../../src/service/walletService";
import { closeModal, openedModal } from "../../../src/utils/modals";
import { connectedPublicKey } from "../../../src/utils/store";

const SMART_ACCOUNT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

/** Horizon, holding `xlm` for every account, or knowing none (`null`). */
function horizon(xlm: string | null) {
  const fetchMock = vi.fn(async () =>
    xlm === null
      ? new Response("", { status: 404 })
      : Response.json({
          sequence: "1",
          balances: [{ asset_type: "native", balance: xlm }],
        }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("connecting a wallet", () => {
  beforeEach(() => {
    closeModal();
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => void saved.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("offers to fund an account the network does not know", async () => {
    const address = Keypair.random().publicKey();
    authModalMock.mockResolvedValue({ address });
    horizon(null);

    await expect(connect()).resolves.toBe(address);

    expect(connectedPublicKey.get()).toBe(address);
    await vi.waitFor(() =>
      expect(openedModal.get()).toEqual({
        name: "funding",
        props: { exists: false, balance: 0, network: "testnet" },
      }),
    );
  });

  it("leaves a funded account alone, and never asks Horizon about a smart account", async () => {
    authModalMock.mockResolvedValue({ address: Keypair.random().publicKey() });
    const funded = horizon("20.0000000");
    await connect();
    await vi.waitFor(() => expect(funded).toHaveBeenCalledOnce());

    authModalMock.mockResolvedValue({ address: SMART_ACCOUNT });
    const smart = horizon(null);
    await connect();

    await new Promise((resolve) => setTimeout(resolve));
    expect(smart).not.toHaveBeenCalled();
    expect(openedModal.get()).toBeNull();
  });
});
