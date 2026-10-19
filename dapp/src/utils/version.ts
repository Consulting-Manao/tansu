import { everyHourAndOnReturn } from "./serviceWorker";

/**
 * Whether the site now serves another build than this tab runs, as its
 * version.json says. Offline, or without a readable version.json, the tab
 * counts as current.
 */
export async function isOutdated(
  get: () => Promise<Response> = () =>
    fetch("/version.json", { cache: "no-store" }),
): Promise<boolean> {
  try {
    const response = await get();
    if (!response.ok) return false;
    const { build } = (await response.json()) as { build?: unknown };
    return typeof build === "string" && build !== import.meta.env.PUBLIC_BUILD;
  } catch {
    return false;
  }
}

/**
 * Calls `outdated` once the site serves another build. The service worker
 * finds most new versions itself, but not when there is none: a browser
 * without one, a failed registration, or a worker stuck on an old sw.js.
 */
export function watchVersion(outdated: () => void): void {
  everyHourAndOnReturn(async () => {
    if (await isOutdated()) outdated();
  });
}

/**
 * Reloads from the network: unregisters the service worker and drops every
 * cache first, so nothing of the old version is served again. The next load
 * registers the worker anew.
 */
export async function clearAndReload(): Promise<void> {
  try {
    const registrations =
      (await navigator.serviceWorker?.getRegistrations()) ?? [];
    const names = "caches" in globalThis ? await caches.keys() : [];
    await Promise.all([
      ...registrations.map((registration) => registration.unregister()),
      ...names.map((name) => caches.delete(name)),
    ]);
  } finally {
    window.location.reload();
  }
}
