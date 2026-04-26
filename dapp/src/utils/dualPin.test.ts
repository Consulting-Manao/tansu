import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pinToFilebase, pinToPinata, pinToBackups, pinConfig } from "./dualPin";

// Mock fetch globally
global.fetch = vi.fn();

describe("dualPin utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Use vi.spyOn to mock pinConfig getters
    vi.spyOn(pinConfig, "getFilebaseKey").mockReturnValue("fb-key");
    vi.spyOn(pinConfig, "getPinataJwt").mockReturnValue("pn-jwt");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should attempt to pin to both providers in pinToBackups", async () => {
    (fetch as any)
      .mockResolvedValueOnce({ ok: true }) // Filebase
      .mockResolvedValueOnce({ ok: true }); // Pinata

    const results = await pinToBackups("bafy-cid");
    
    expect(results).toHaveLength(2);
    expect(results[0].pinned).toBe(true);
    expect(results[1].pinned).toBe(true);
  });

  it("should retry on failure", async () => {
    (fetch as any)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ ok: true });

    const pinPromise = pinToFilebase("bafy-cid");
    
    // Fast-forward time for retries
    await vi.runAllTimersAsync();
    
    const result = await pinPromise;
    expect(result.pinned).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("should fail after max retries", async () => {
    (fetch as any).mockRejectedValue(new Error("Persistent error"));

    const pinPromise = pinToFilebase("bafy-cid");
    
    // Fast-forward time for retries
    await vi.runAllTimersAsync();

    const result = await pinPromise;
    expect(result.pinned).toBe(false);
    expect(result.error).toContain("Persistent error");
    expect(fetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("should return error if API keys are missing", async () => {
    vi.spyOn(pinConfig, "getPinataJwt").mockReturnValue("");

    const result = await pinToPinata("bafy-cid");
    expect(result.pinned).toBe(false);
    expect(result.error).toBe("JWT not configured");
  });
});
