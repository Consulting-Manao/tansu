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
  // And its fonts, so the installed app keeps its type offline (the worker
  // keys files without a hash in their name with a revision query).
  const fonts = cached.filter((url) => /\/fonts\/.+\.woff2($|\?)/.test(url));
  expect(fonts).toHaveLength(6);

  // Offline, an old proposals link still lands on the project's tab.
  await context.setOffline(true);
  await page.goto("/governance/?name=demo");
  await expect(page).toHaveURL(/\/project\/\?name=demo&tab=proposals/);
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
});

// The fonts are self-hosted from their original releases because Google's
// copies drop small caps and old-style figures: a feature that went missing
// leaves the text exactly as wide as without it.
test("the fonts keep their OpenType features", async ({ page }) => {
  await page.goto("/");
  const widths = await page.evaluate(async () => {
    const width = (family: string, text: string, style: string) => {
      const span = document.createElement("span");
      span.style.cssText = `position: absolute; white-space: nowrap; font: 40px ${family}; font-synthesis: none; ${style}`;
      span.textContent = text;
      document.body.append(span);
      const { width } = span.getBoundingClientRect();
      span.remove();
      return width;
    };
    const serif = '"Source Serif 4"';
    const sans = '"Bricolage Grotesque"';
    await Promise.all([
      document.fonts.load(`40px ${serif}`),
      document.fonts.load(`40px ${sans}`),
      document.fonts.load('40px "Dank Mono"'),
    ]);
    return {
      loaded: [serif, sans, '"Dank Mono"'].every((family) =>
        document.fonts.check(`40px ${family}`),
      ),
      caps: width(serif, "XLM", ""),
      smallCaps: width(serif, "XLM", "font-variant-caps: all-small-caps"),
      // In running text, as the prose rule sets them: proportional figures
      // (tabular old-style ones are exactly as wide as tabular lining ones).
      lining: width(
        serif,
        "2026 1789",
        "font-variant-numeric: lining-nums proportional-nums",
      ),
      oldstyle: width(
        serif,
        "2026 1789",
        "font-variant-numeric: oldstyle-nums proportional-nums",
      ),
      proportional: width(
        sans,
        "1111",
        "font-variant-numeric: proportional-nums",
      ),
      tabular: width(sans, "1111", "font-variant-numeric: tabular-nums"),
    };
  });
  expect(widths.loaded).toBe(true);
  expect(widths.smallCaps).toBeLessThan(widths.caps);
  expect(widths.oldstyle).not.toBe(widths.lining);
  expect(widths.tabular).toBeGreaterThan(widths.proportional);
});
