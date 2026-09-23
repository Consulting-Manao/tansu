import { describe, it, expect, vi, afterEach } from "vitest";

const ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const SMART_ACCOUNT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const OWNER = "GCILP4HWE2QGEO4KUMOZ6S6J3A46W47EVCGZW2YPYCPH5CQF6EACNBCN";

vi.mock("../../../src/utils/store", () => ({
  connectedPublicKey: { set: vi.fn() },
  walletInitialized: { set: vi.fn() },
}));

describe("txSourceFor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps an account as its own source", async () => {
    const { txSourceFor } = await import("../../../src/service/walletService");
    expect(txSourceFor(ACCOUNT)).toBe(ACCOUNT);
  });

  it("sources a smart account's transactions from an existing account", async () => {
    vi.stubEnv("PUBLIC_TANSU_OWNER_ID", OWNER);
    const { txSourceFor } = await import("../../../src/service/walletService");
    expect(txSourceFor(SMART_ACCOUNT)).toBe(OWNER);
  });
});
