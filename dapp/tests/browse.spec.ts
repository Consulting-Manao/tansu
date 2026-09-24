import { DEAD_CID, expect, test } from "./helpers/app";

test.describe("browsing without a wallet", () => {
  test.use({ acceptTerms: false });

  test("accept the terms, find a project and read it through", async ({
    page,
    web,
  }) => {
    await page.goto("/");

    // The terms can be accepted once they have been scrolled through.
    const terms = page.getByRole("dialog", { name: "Terms of Service" });
    const accept = terms.getByRole("button", { name: "Accept Terms" });
    await terms.getByRole("button", { name: "Terms of Service" }).click();
    await expect(accept).toBeDisabled();
    await terms
      .locator(".overflow-auto")
      .evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await accept.click();
    await expect(terms).toBeHidden();

    // Cards fill in from each tansu.toml. A CID nobody provides leaves a bare
    // card and is asked for once, even across reloads.
    const cards = page.locator(".all-projects-section .project-card");
    await expect(cards.filter({ hasText: "demo" })).toContainText(
      "Demo Foundation",
    );
    await expect(cards.filter({ hasText: "ghost" })).toContainText(
      "No description",
    );
    await page.reload();
    await expect(cards.filter({ hasText: "ghost" })).toContainText(
      "No description",
    );
    expect(web.ipfsRequests.filter((r) => r.startsWith(DEAD_CID))).toHaveLength(
      1,
    );

    // Search finds the project on chain; its card leads to the project page.
    const search = page.getByRole("textbox", {
      name: "Search projects or community...",
    });
    await search.fill("demo");
    await search.press("Enter");
    await page
      .locator(".project-list-container .project-card img")
      .first()
      .click();
    await page.getByRole("button", { name: "View Details" }).click();

    await expect(page).toHaveURL(/\/project\/?\?name=demo/);
    await expect(
      page.getByRole("heading", { name: "Pony Factor" }),
    ).toBeVisible();
    // Its activity, month by month, newest first.
    await expect(
      page
        .getByRole("list")
        .filter({ hasText: "Aug 26" })
        .getByRole("listitem"),
    ).toHaveText([/^Sep 26\s*1$/, /^Aug 26\s*1$/]);
    await page.getByRole("button", { name: "Read More" }).click();
    await expect(
      page.getByText("The README of the demo project."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close modal" }).click();

    // Its proposals, then one of them.
    await page.getByRole("button", { name: "Proposals" }).click();
    await expect(
      page.getByRole("link", {
        name: /Ship the dark theme.*Pending execution/,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Adopt a code of conduct/ }).click();
    await expect(
      page.getByText("We adopt the Contributor Covenant."),
    ).toBeVisible();
    await expect(page.getByText("if (a < b && c) {}")).toBeVisible();
    await expect(page.locator('meta[http-equiv="refresh"], form')).toHaveCount(
      0,
    );
    await expect(page.getByText("Merge the code of conduct.")).toBeVisible();
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
  await page.waitForLoadState("networkidle");
  expect(dialogs).toEqual([]);
});
