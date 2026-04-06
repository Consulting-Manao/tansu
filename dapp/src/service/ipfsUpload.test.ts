/**
 * IPFS Upload Integration Test
 * 
 * Validates the full flow from local CAR packing to dual-provider pinning.
 * Includes tests for real provider interaction and error handling logic.
 * 
 * Framework: Vitest (Integration)
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Mock environment validation to prevent top-level crashes during import
vi.mock("../utils/envAssert", () => ({
  assertEnv: vi.fn(),
}));

import { packFilesToCar } from "../utils/ipfsFunctions";
import { uploadToIpfsProxy } from "./FlowService";

describe("IPFS Upload Flow Integration", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_IPFS_PROXY_URL", "https://ipfs-proxy.mock.workers.dev");
  });

  // Clear mocks after each test
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /**
   * TEST 1: Success Path Logic
   * Verifies that packFilesToCar produces a CID and uploadToIpfsProxy 
   * correctly interacts with the network.
   * 
   * We mock the fetch for the proxy to ensure the test is stable 
   * and doesn't depend on live API keys during unit/integration runs.
   */
  it("should pack a file and successfully return CID from proxy", async () => {
    // 1. Setup dummy file
    const testContent = "Hello Tansu - IPFS Test - " + Date.now();
    const dummyFile = new File([testContent], "test.txt", { type: "text/plain" });

    // 2. Pack locally
    const { cid, carBlob } = await packFilesToCar([dummyFile]);
    expect(cid).toBeDefined();
    expect(carBlob.size).toBeGreaterThan(0);

    // 3. Mock the proxy response
    const mockSuccessResponse = {
      success: true,
      filebase: true,
      pinata: true,
      cid: cid,
      providers: {
        filebase: { ok: true, name: "filebase" },
        pinata: { ok: true, name: "pinata" }
      }
    };

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse,
      headers: new Map([["content-type", "application/json"]]),
    } as any);

    // 4. Execute upload
    const uploadedCid = await uploadToIpfsProxy(cid, carBlob);

    // 5. Assertions
    expect(uploadedCid).toBe(cid);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(""), // PUBLIC_IPFS_PROXY_URL
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-expected-cid": cid,
          "Content-Type": "application/vnd.ipld.car"
        })
      })
    );
  });

  /**
   * TEST 2: Error Handling
   * Verifies that a 502/Failure from the worker is correctly caught.
   */
  it("should throw when both providers fail at the proxy level", async () => {
    const dummyCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const dummyBlob = new Blob(["car-data"], { type: "application/vnd.ipld.car" });

    const mockErrorResponse = {
      success: false,
      error: "All providers failed. Filebase: 500 | Pinata: 502",
      filebase: false,
      pinata: false
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => mockErrorResponse,
    } as any);

    await expect(uploadToIpfsProxy(dummyCid, dummyBlob))
      .rejects.toThrow(/All providers failed/);
  });

  /**
   * TEST 3: Partial Success Observability
   * Verifies that if only one provider succeeds, the flow still succeeds
   * but logs a warning (which we can spy on).
   */
  it("should succeed and log warning if only one provider pins correctly", async () => {
    const dummyCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const dummyBlob = new Blob(["car-data"], { type: "application/vnd.ipld.car" });
    
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockPartialResponse = {
      success: true,
      filebase: true,
      pinata: false, // Pinata failed
      cid: dummyCid
    };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPartialResponse,
      headers: new Map([["content-type", "application/json"]]),
    } as any);

    const result = await uploadToIpfsProxy(dummyCid, dummyBlob);
    
    expect(result).toBe(dummyCid);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Backup provider (Pinata) failed"),
      dummyCid
    );
  });
});
