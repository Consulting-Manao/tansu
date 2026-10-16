import { execSync } from "node:child_process";
import { expect, test } from "./helpers/app";
import { E2E_ENV } from "./helpers/env";

test.use({ serviceWorkers: "allow" });
// Both tests rebuild dist/.
test.describe.configure({ mode: "serial" });

/** A deploy that changes the bundle. */
const deploy = (id: string) =>
  execSync("bun run build", {
    env: {
      ...process.env,
      ...E2E_ENV,
      DEPLOY_ID: id,
      PUBLIC_DELEGATION_API_URL: `https://ipfs.${id}.e2e.test/`,
    },
    stdio: "ignore",
  });

// Runs after every other test (playwright.config.ts): it rebuilds dist/.
test("a new deploy is offered, and taken on Reload in every tab", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // The page's scripts and islands: a deploy changes their hashed names.
  const bundle = (tab = page) =>
    tab.evaluate(() =>
      [
        ...[...document.scripts].map((s) => s.src),
        ...[...document.querySelectorAll("astro-island")].map((island) =>
          island.getAttribute("component-url"),
        ),
      ].join(),
    );
  // The deploys whose files the page runs, once its islands are up: a file
  // of another deploy would bring a second React.
  const deploys = async (tab = page) => {
    await expect(tab.locator("astro-island[ssr]")).toHaveCount(0);
    return tab.evaluate(() => [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((entry) => new URL(entry.name).searchParams.get("dpl"))
          .filter((id) => id !== null),
      ),
    ]);
  };
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const deployed = await bundle();
  expect(await deploys()).toEqual(["e2e-1"]);
  // A second tab of the same app.
  const other = await page.context().newPage();
  await other.goto("/");

  // A deploy that changes the bundle, while the tab stays open.
  deploy("e2e-2");

  // Coming back to the tab looks for a new sw.js; the page keeps its version.
  for (const tab of [page, other]) {
    await tab.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(tab.getByText("A new version is ready")).toBeVisible();
  }
  await page.goto("/governance/?name=demo");
  await page.goto("/");
  expect(await bundle()).toBe(deployed);

  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Reload" }).click(),
  ]);
  expect(await bundle()).not.toBe(deployed);
  expect(await deploys()).toEqual(["e2e-2"]);
  await expect(page.getByText("A new version is ready")).toBeHidden();

  // The other tab, still on the old version, takes the new one on Reload.
  await expect(other.getByText("A new version is ready")).toBeVisible();
  await Promise.all([
    other.waitForEvent("load"),
    other.getByRole("button", { name: "Reload" }).click(),
  ]);
  expect(await bundle(other)).toBe(await bundle());
  expect(await deploys(other)).toEqual(["e2e-2"]);
  await expect(other.getByText("A new version is ready")).toBeHidden();
});

// No service worker to find the deploy: the tab learns of it from version.json.
test("a new deploy is offered without a service worker", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    baseURL: baseURL!,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.goto("/");
  const footer = page.getByTitle("Version");
  const running = await footer.textContent();

  deploy("e2e-3");
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByText("A new version is ready")).toBeVisible();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Reload" }).click(),
  ]);
  await expect(footer).not.toHaveText(running!);
  await expect(page.getByText("A new version is ready")).toBeHidden();
  await context.close();
});
