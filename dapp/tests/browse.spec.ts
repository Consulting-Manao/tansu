import { expect, test } from "./helpers/app";
import {
  createProposal,
  fundedKeypair,
  registerProject,
  uniqueName,
} from "./helpers/testnet";

const project = uniqueName("browse");
let proposal = 0;

// One setup for the file: the flows below read the same project.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const maintainer = await fundedKeypair();
  await registerProject(project, [maintainer]);
  proposal = await createProposal(
    maintainer,
    project,
    "Adopt a code of conduct",
    2 * 24 * 3600,
  );
});

test.describe("browsing without a wallet", () => {
  test.use({ acceptTerms: false });

  test("accept the terms, find a project and read it through", async ({
    page,
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

    // Search finds the project on chain; its card is a link to its page,
    // filled in from its tansu.toml and its Radicle repository.
    const search = page
      .getByRole("banner")
      .getByRole("searchbox", { name: "Search projects or members" });
    await search.fill(project);
    await search.press("Enter");
    await page.getByRole("link", { name: new RegExp(project) }).click();
    await expect(page).toHaveURL(new RegExp(`/project/?\\?name=${project}`));
    await expect(page.getByText("E2E Labs").first()).toBeVisible();
    // The code tab reads the metrics once their section is in view.
    await page.getByRole("tab", { name: "Code" }).click();
    await page.getByText("Contribution Metrics").scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("heading", { name: "Pony Factor" }),
    ).toBeVisible({ timeout: 60_000 });

    // Its proposals, then one of them, read from IPFS.
    await page.getByRole("tab", { name: "Proposals" }).click();
    await expect(page).toHaveURL(/tab=proposals/);
    await page.getByRole("link", { name: /Adopt a code of conduct/ }).click();
    await expect(page.getByText("Set up by the e2e flows.")).toBeVisible();
  });

  test("the terms still show after landing on them first", async ({ page }) => {
    const terms = page.getByRole("dialog", { name: "Terms of Service" });
    await page.goto("/terms/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(terms).toBeHidden();
    await page.getByRole("link", { name: "Tansu homepage" }).click();
    await expect(terms).toBeVisible();
  });
});

test("no page scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [
    "/",
    `/project/?name=${project}`,
    `/project/?name=${project}&tab=proposals`,
    `/proposal/?id=${proposal}&name=${project}`,
    "/terms/",
  ]) {
    await page.goto(path);
    // The page's own; a proposal's Markdown can hold another.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
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
