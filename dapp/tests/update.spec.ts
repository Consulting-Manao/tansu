import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { acceptTermsIn, expect, test } from "./helpers/app";
import { E2E_ENV } from "./helpers/env";

test.use({ serviceWorkers: "allow" });

/** The scripts and islands a page runs, once hydration has finished. */
async function bundle(page: Page) {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  return page.evaluate(() =>
    [
      ...[...document.scripts].map((script) => script.src),
      ...[...document.querySelectorAll("astro-island")].map((island) =>
        island.getAttribute("component-url"),
      ),
    ].join(),
  );
}

/** A mixed deploy can bring a second React even when the page looks current. */
async function expectDeploy(page: Page, id: string) {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  expect(
    await page.evaluate(() => [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((entry) => new URL(entry.name).searchParams.get("dpl"))
          .filter((deploy) => deploy !== null),
      ),
    ]),
  ).toEqual([id]);
}

async function checkCurrentVersion(page: Page, version: string) {
  await expect(page.getByTitle("Version")).toHaveText(version);
  const answered = page.waitForResponse("**/version.json");
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await answered;
  await expect(page.getByText("A new version is ready")).toBeHidden();
}

// Runs after the other flows because it rebuilds dist/. All update scenarios
// share one real deploy instead of rebuilding the same app four times.
test("one deploy updates every tab and visited page, with or without a service worker", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const withoutWorker = await browser.newContext({
    baseURL: baseURL!,
    serviceWorkers: "block",
  });
  await acceptTermsIn(withoutWorker);
  const errors: string[] = [];
  withoutWorker.on("page", (tab) =>
    tab.on("pageerror", (error) => errors.push(error.message)),
  );
  try {
    const other = await context.newPage();
    const plain = await withoutWorker.newPage();
    const tabs = [page, other, plain];

    await test.step("prime the old deploy and its visited-page caches", async () => {
      for (const tab of tabs) {
        await tab.goto("/");
        if (tab !== plain) {
          await tab.evaluate(() => navigator.serviceWorker.ready);
          await tab.reload();
        }
        await tab.goto("/terms/");
        await tab.goto("/");
        await expectDeploy(tab, "e2e-1");
      }
    });
    const oldBundle = await bundle(page);
    const oldVersion = await plain.getByTitle("Version").textContent();

    await test.step("publish a changed build and offer it in all three tabs", async () => {
      execFileSync("bun", ["run", "build"], {
        env: {
          ...process.env,
          ...E2E_ENV,
          DEPLOY_ID: "e2e-2",
          COMMIT_REF: "e2e-2",
          PUBLIC_DELEGATION_API_URL: "https://ipfs.e2e-2.e2e.test/",
        },
        stdio: "pipe",
      });
      for (const tab of tabs) {
        await tab.evaluate(() =>
          document.dispatchEvent(new Event("visibilitychange")),
        );
        await expect(tab.getByText("A new version is ready")).toBeVisible();
      }
      // The installed app still navigates on the old deploy until Reload.
      await page.goto("/project/?name=demo&tab=proposals");
      await page.goto("/");
      expect(await bundle(page)).toBe(oldBundle);
    });

    for (const [index, tab] of tabs.entries()) {
      await test.step(`reload tab ${index + 1} and revisit cached pages`, async () => {
        // Reload in one tab must leave the other tabs' update offers intact.
        await expect(tab.getByText("A new version is ready")).toBeVisible();
        await Promise.all([
          tab.waitForEvent("load"),
          tab.getByRole("button", { name: "Reload" }).click(),
        ]);
        expect(await bundle(tab)).not.toBe(oldBundle);
        await expectDeploy(tab, "e2e-2");
        await expect(tab.getByTitle("Version")).not.toHaveText(oldVersion!);
        const current = (await tab.getByTitle("Version").textContent())!;
        await checkCurrentVersion(tab, current);

        // ClientRouter navigation and a full load must both use the new HTML.
        await tab
          .getByRole("link", { name: "Terms of Service", exact: true })
          .click();
        await expect(tab).toHaveURL(/\/terms\/$/);
        await checkCurrentVersion(tab, current);
        await tab.goto("/terms/");
        await checkCurrentVersion(tab, current);
        await expectDeploy(tab, "e2e-2");
      });
    }
    expect(errors).toEqual([]);
  } finally {
    await withoutWorker.close();
  }
});
