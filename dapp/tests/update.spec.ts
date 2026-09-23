import { execSync } from "node:child_process";
import { expect, test } from "./helpers/app";
import { E2E_ENV } from "./helpers/env";

test.use({ serviceWorkers: "allow" });

// Runs after every other test (playwright.config.ts): it rebuilds dist/.
test("a new deploy is offered, and taken on Reload", async ({ page }) => {
  test.setTimeout(180_000);
  const scripts = () =>
    page.evaluate(() => [...document.scripts].map((s) => s.src).join());
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const deployed = await scripts();

  // A deploy that changes the bundle, while the tab stays open.
  execSync("bun run build", {
    env: {
      ...process.env,
      ...E2E_ENV,
      PUBLIC_DELEGATION_API_URL: "https://ipfs.next.e2e.test/",
    },
    stdio: "ignore",
  });

  // Coming back to the tab looks for a new sw.js; the page keeps its version.
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByText("A new version is ready")).toBeVisible();
  await page.goto("/governance/?name=demo");
  await page.goto("/");
  expect(await scripts()).toBe(deployed);

  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Reload" }).click(),
  ]);
  expect(await scripts()).not.toBe(deployed);
  await expect(page.getByText("A new version is ready")).toBeHidden();
});
