import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAndReload,
  isOutdated,
  watchVersion,
} from "../../../src/utils/version";

/** version.json as the site serves it. */
const served =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe("isOutdated", () => {
  beforeEach(() => vi.stubEnv("PUBLIC_BUILD", "abc1234"));
  afterEach(() => vi.unstubAllEnvs());

  it("tells another build from the running one", async () => {
    expect(await isOutdated(served({ build: "abc1234" }))).toBe(false);
    expect(await isOutdated(served({ build: "def5678" }))).toBe(true);
  });

  it("counts the tab as current when it cannot tell", async () => {
    // Offline, missing, or not what the build writes.
    expect(await isOutdated(() => Promise.reject(new TypeError()))).toBe(false);
    expect(await isOutdated(served({ build: "def5678" }, 404))).toBe(false);
    expect(await isOutdated(served({}))).toBe(false);
    expect(await isOutdated(async () => new Response("<!doctype html>"))).toBe(
      false,
    );
  });
});

describe("watchVersion", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("looks every hour and when the tab comes back", async () => {
    vi.useFakeTimers();
    vi.stubEnv("PUBLIC_BUILD", "abc1234");
    const page = Object.assign(new EventTarget(), {
      visibilityState: "hidden",
    });
    vi.stubGlobal("document", page);
    let build = "abc1234";
    vi.stubGlobal("fetch", async () => Response.json({ build }));
    const outdated = vi.fn();
    watchVersion(outdated);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(outdated).not.toHaveBeenCalled();

    // A deploy while the tab sits in the background.
    build = "def5678";
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(outdated).toHaveBeenCalledOnce());
  });
});

describe("clearAndReload", () => {
  const reload = vi.fn();
  afterEach(() => {
    vi.unstubAllGlobals();
    reload.mockReset();
  });

  it("drops the worker and every cache, then reloads", async () => {
    const unregister = vi.fn(async () => true);
    const remove = vi.fn(async () => true);
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: async () => [{ unregister }] },
    });
    vi.stubGlobal("caches", {
      keys: async () => ["workbox-precache-v2", "tansu-images"],
      delete: remove,
    });
    vi.stubGlobal("window", { location: { reload } });

    await clearAndReload();
    expect(unregister).toHaveBeenCalledOnce();
    expect(remove.mock.calls).toEqual([
      ["workbox-precache-v2"],
      ["tansu-images"],
    ]);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads even when clearing fails", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: () => Promise.reject(new Error("blocked")),
      },
    });
    vi.stubGlobal("window", { location: { reload } });

    await expect(clearAndReload()).rejects.toThrow("blocked");
    expect(reload).toHaveBeenCalledOnce();
  });
});
