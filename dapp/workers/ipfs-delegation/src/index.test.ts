import { describe, it, expect, vi, beforeEach } from "vitest";
import { CarReader } from "@ipld/car";
import {
  validateSignedTransaction,
  calculateCidFromCar,
  buildUploadBlob,
} from "./index";

describe("validateSignedTransaction", () => {
  it("throws for empty string", () => {
    expect(() => validateSignedTransaction("")).toThrow(
      "Transaction signature is invalid",
    );
  });

  it("throws for invalid XDR", () => {
    expect(() => validateSignedTransaction("not-valid-xdr")).toThrow(
      "Transaction signature is invalid",
    );
  });
});

describe("calculateCidFromCar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws for CAR with no root", async () => {
    vi.spyOn(CarReader, "fromBytes").mockResolvedValue({
      getRoots: async () => [],
      blocks: (async function* () {})(),
    } as any);

    const blob = new Blob([""], { type: "application/vnd.ipld.car" });
    await expect(calculateCidFromCar(blob)).rejects.toThrow(
      "CAR file has no declared root",
    );
  });

  it("returns root CID when present", async () => {
    const mockRoot = {
      toString: () => "bafyrei123",
    };
    vi.spyOn(CarReader, "fromBytes").mockResolvedValue({
      getRoots: async () => [mockRoot],
      blocks: (async function* () {})(),
    } as any);

    const blob = new Blob([""], { type: "application/vnd.ipld.car" });
    const cid = await calculateCidFromCar(blob);
    expect(cid).toBe("bafyrei123");
  });
});

describe("buildUploadBlob", () => {
  it("creates valid blob from base64 CAR", () => {
    const base64 = "Y3ViZQo=";
    const blob = buildUploadBlob(base64);
    expect(blob.type).toBe("application/vnd.ipld.car");
  });
});
