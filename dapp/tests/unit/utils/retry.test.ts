import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retryAsync } from "../../../src/utils/retry";

// Use a very short delay so real-timer tests complete quickly
const SHORT_DELAY = 1;

describe("retryAsync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the result when fn succeeds on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const promise = retryAsync(fn, 3, 250);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on the third attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("success");
    const promise = retryAsync(fn, 3, 250);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("applies exponential backoff: 250ms, 500ms, 1000ms", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockRejectedValueOnce(new Error("fail3"))
      .mockResolvedValue("finally");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const promise = retryAsync(fn, 3, 250);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("finally");

    const settimeoutCalls = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => typeof delay === "number",
    );
    expect(settimeoutCalls[0]![1]).toBe(250);
    expect(settimeoutCalls[1]![1]).toBe(500);
    expect(settimeoutCalls[2]![1]).toBe(1000);

    setTimeoutSpy.mockRestore();
  });
});

describe("retryAsync — real timers (failure cases)", () => {
  // Use real timers for rejection tests to avoid unhandled rejection warnings
  // from fake-timer promise chains.

  it("throws after exhausting all retries", async () => {
    const error = new Error("persistent failure");
    const fn = vi.fn().mockRejectedValue(error);
    await expect(retryAsync(fn, 2, SHORT_DELAY)).rejects.toThrow(
      "persistent failure",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retries = 0", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("no retry"));
    await expect(retryAsync(fn, 0, SHORT_DELAY)).rejects.toThrow("no retry");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propagates the last error when all retries fail", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockRejectedValueOnce(new Error("last"));
    await expect(retryAsync(fn, 2, SHORT_DELAY)).rejects.toThrow("last");
  });
});
