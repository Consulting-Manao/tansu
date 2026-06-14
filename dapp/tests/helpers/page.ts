import type { Page } from "@playwright/test";

export async function gotoStable(
  page: Page,
  url: string,
  timeout = 30_000,
): Promise<void> {
  await page.goto(url, { waitUntil: "commit", timeout }).catch(() => {});
  await page
    .waitForLoadState("domcontentloaded", { timeout: 5_000 })
    .catch(() => {});
  await page
    .waitForFunction(
      () => document.body && document.body.children.length > 0,
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}
