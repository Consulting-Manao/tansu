import { expect, test } from "./helpers/app";

test.use({ serviceWorkers: "allow" });

test("the app opens offline once installed", async ({ page, context }) => {
  await page.goto("/");
  // The first visit installs the worker, which serves the next navigations.
  await page.evaluate(() => navigator.serviceWorker.ready);
  // It holds the app, the proposal page's XDR decoder (WebAssembly) too.
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  });
  expect(cached.some((url) => /\.wasm($|\?)/.test(url))).toBe(true);

  await context.setOffline(true);
  await page.goto("/governance/?name=demo");
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
});
