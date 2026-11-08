import { expect, test } from "@playwright/test";

// The kit page needs no wallet and no testnet: the plain Playwright test,
// with the journeys' rule that no page error goes unnoticed.
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/kit/");
  await expect(
    page.getByRole("heading", { name: "The Tansu kit" }),
  ).toBeVisible();
});
test.afterEach(() => expect(errors).toEqual([]));

test("every control is named and every field labelled", async ({ page }) => {
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href], input, select, textarea")]
      .filter((element) => {
        const control = element as HTMLElement;
        const labelled =
          control.getAttribute("aria-label") ||
          (control as HTMLInputElement).labels?.length ||
          control.textContent?.trim();
        return !labelled;
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
  await expect(page.getByLabel("Repository")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Repository")).toHaveAccessibleDescription(
    "This repository has no tansu.toml.",
  );
});

test("tabs follow the arrow keys", async ({ page }) => {
  const tabs = page.getByRole("tablist", { name: "Project" });
  await tabs.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Code" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(tabs.getByRole("tab", { name: "Code" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tabpanel")).toHaveText(
    "Maintainers and members.",
  );
});

test("a segment is pressed once chosen", async ({ page }) => {
  const filters = page.getByRole("group", { name: "Show proposals" });
  await filters.getByRole("button", { name: /Active/ }).click();
  await expect(filters.getByRole("button", { name: /Active/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("dark is the same tokens with other values", async ({ page }) => {
  const ground = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await ground();
  await page
    .getByRole("group", { name: "Theme" })
    .getByRole("button", { name: "Dark" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    )
    .toBe("dark");
  expect(await ground()).not.toBe(light);
});

test("nothing scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
