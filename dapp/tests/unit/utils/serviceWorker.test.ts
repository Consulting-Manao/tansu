import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workbox } from "workbox-window";
import { registerServiceWorker } from "../../../src/utils/serviceWorker";

/** A new version taking control of the page, as Workbox reports it. */
const takeover = () =>
  Object.assign(new Event("controlling"), { isUpdate: true });

class FakeWorkbox extends EventTarget {
  register = vi.fn(async () => undefined);
  update = vi.fn(async () => undefined);
  // The waiting worker takes over as soon as it is told to.
  messageSkipWaiting = vi.fn(() => this.dispatchEvent(takeover()));
}

describe("registerServiceWorker", () => {
  const reload = vi.fn();
  let page: EventTarget & { visibilityState: string };

  beforeEach(() => {
    vi.useFakeTimers();
    page = Object.assign(new EventTarget(), { visibilityState: "hidden" });
    vi.stubGlobal("document", page);
    vi.stubGlobal("window", { location: { reload } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    reload.mockReset();
  });

  it("offers a new version, switches on Reload and keeps looking", () => {
    const wb = new FakeWorkbox();
    const prompt = vi.fn<(update: () => void) => void>();
    registerServiceWorker(wb as unknown as Workbox, prompt);
    expect(wb.register).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();

    // A new sw.js installed: nothing changes until the user reloads.
    wb.dispatchEvent(new Event("waiting"));
    expect(prompt).toHaveBeenCalledOnce();
    expect(wb.messageSkipWaiting).not.toHaveBeenCalled();
    prompt.mock.calls[0]![0]();
    expect(wb.messageSkipWaiting).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();

    // Page changes never fetch sw.js: an hourly check and coming back do.
    expect(wb.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(wb.update).toHaveBeenCalledTimes(1);
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(wb.update).toHaveBeenCalledTimes(2);
  });

  it("reloads a tab whose new version another tab activated", () => {
    const wb = new FakeWorkbox();
    const prompt = vi.fn<(update: () => void) => void>();
    registerServiceWorker(wb as unknown as Workbox, prompt);
    wb.dispatchEvent(new Event("waiting"));

    // Another tab's Reload: the new version controls this tab too, which
    // keeps running the old one until its user reloads.
    wb.dispatchEvent(takeover());
    expect(reload).not.toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledTimes(2);
    prompt.mock.calls[1]![0]();
    expect(wb.messageSkipWaiting).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });
});
