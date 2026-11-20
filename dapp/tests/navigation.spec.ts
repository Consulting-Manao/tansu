import { expect, test } from "./helpers/app";

// These checks need no testnet setup and must still run when uploads fail.
test.describe("legal entry", () => {
  test.use({ acceptTerms: false });

  test("the terms still show after landing on them first", async ({ page }) => {
    const terms = page.getByRole("dialog", { name: "Terms of Service" });
    await page.goto("/terms/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(terms).toBeHidden();
    await page.getByRole("link", { name: "Tansu homepage" }).click();
    await expect(terms).toBeVisible();
  });
});

test("a script in the address stays text", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.goto(
    `/project/?name=${encodeURIComponent("<img src=x onerror=alert(1)>")}`,
  );
  await expect(
    page.getByText("<img src=x onerror=alert(1)>", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator("img[onerror]")).toHaveCount(0);
  expect(dialogs).toEqual([]);
});
