import type { Workbox } from "workbox-window";

const HOUR = 60 * 60 * 1000;

/**
 * Registers the service worker and offers each new version through `prompt`.
 * The callback it receives activates the waiting worker; the page reloads
 * once that worker controls it. ClientRouter page changes never make the
 * browser look for a new sw.js, so this looks every hour and whenever the
 * tab comes back.
 */
export function registerServiceWorker(
  wb: Workbox,
  prompt: (update: () => void) => void,
): void {
  wb.addEventListener("waiting", () =>
    prompt(() => {
      wb.addEventListener("controlling", () => window.location.reload());
      wb.messageSkipWaiting();
    }),
  );
  wb.register().catch((error) =>
    console.warn("Service worker not registered", error),
  );
  const check = () => wb.update().catch(() => {});
  setInterval(check, HOUR);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
}
