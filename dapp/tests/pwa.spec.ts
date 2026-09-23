import { expect, test } from "./helpers/app";

test.use({ serviceWorkers: "allow" });

test("the app opens offline once installed", async ({ page, context }) => {
  await page.goto("/");
  // The first visit installs the worker, which serves the next navigations.
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.goto("/governance/?name=demo");
  await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
});
