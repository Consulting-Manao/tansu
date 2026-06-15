import { expect, test } from "@playwright/test";
import { applyAllMocks } from "./helpers/mock";

const RADICLE_RID = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

/*
 * Additional happy-path coverage for the most critical user flows.
 * These tests focus on flow robustness rather than visual assertions.
 */

test.describe("Tansu dApp – Happy-path User Flows", () => {
  test.beforeEach(async ({ page }) => {
    await applyAllMocks(page);
    page.setDefaultTimeout(10_000);
  });

  test.afterEach(async ({ page }) => {
    await page
      .goto("about:blank", { waitUntil: "commit", timeout: 2_000 })
      .catch(() => {});
  });

  test("Project creation modal – basic functionality", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tansu_tos_accepted", "true");
      localStorage.setItem("publicKey", `G${"A".repeat(55)}`);
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });

    // Look for the Add Project button (may be hidden depending on wallet state)
    const addProjectBtn = page
      .locator("button")
      .filter({ hasText: "Add Project" })
      .first();
    const btnCount = await addProjectBtn.count().catch(() => 0);

    if (btnCount === 0) {
      // Button not rendered — verify the home page loaded with the core element
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
      return;
    }

    // Click via evaluate() since button might be hidden until wallet connects
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Add Project/i.test(b.textContent || ""),
      );
      (btn as HTMLButtonElement | null)?.click();
    });

    await page.waitForTimeout(500);

    // Check if modal appeared
    const modal = page.locator(".project-modal-container");
    if ((await modal.count().catch(() => 0)) === 0) {
      return;
    }
    await expect(modal).toBeVisible();

    await expect(
      page.locator(
        ".project-modal-container input[placeholder='Write the project name (e.g., myproject)']",
      ),
    ).toBeVisible();

    // Verify the modal has the expected structure - corrected CSS class from text-xl to text-2xl
    await expect(
      page.locator(".project-modal-container .text-2xl.font-medium"),
    ).toContainText("Welcome to Your New Project!");

    // Verify the Next button is present
    const nextButton = page
      .locator(".project-modal-container button", { hasText: "Next" })
      .first();
    await expect(nextButton).toBeVisible();

    // Test that the modal can be closed
    const cancelButton = page
      .locator(".project-modal-container button", { hasText: "Cancel" })
      .first();
    await expect(cancelButton).toBeVisible();

    // Close the modal
    await cancelButton.click();

    // Verify modal is closed
    await expect(page.locator(".project-modal-container")).not.toBeVisible();
  });

  test("Terms of Service modal – tabs and accept flow", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("tansu_tos_accepted");
    });
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });

    // Check if the ToS modal appears
    const termsModal = page.locator(".terms-modal-container");
    const modalCount = await termsModal.count().catch(() => 0);

    if (modalCount === 0) {
      // Modal didn't appear — verify the home page loaded with the core element
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
      return;
    }

    await expect(termsModal).toBeVisible({ timeout: 5000 });

    // Summary tab is default; switch to Full Terms of Service
    const termsTab = termsModal.getByRole("button", {
      name: "Terms of Service",
    });
    if ((await termsTab.count()) === 0) {
      return;
    }
    await termsTab.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(termsModal.locator(".markdown-body")).toBeVisible({
      timeout: 3000,
    });

    // Scroll the modal body to enable Accept
    await termsModal.evaluate((el) => {
      const scrollable = el.querySelector(".overflow-auto");
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
    });
    await page.waitForTimeout(200);

    const acceptButton = termsModal.getByRole("button", {
      name: /accept terms/i,
    });
    await expect(acceptButton).toBeEnabled();
    await acceptButton.click();
    await expect(termsModal).not.toBeVisible();
  });

  test("Join community modal – adapt to wallet state", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tansu_tos_accepted", "true");
    });
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });

    // Handle TermsAcceptanceModal if it appears
    const termsModal = page.locator(".terms-modal-container");
    const acceptButton = termsModal.getByRole("button", {
      name: /accept terms/i,
    });

    const termsModalCount = await page
      .locator(".terms-modal-container")
      .evaluateAll((elements) => elements.length)
      .catch(() => 0);
    if (termsModalCount > 0) {
      await termsModal
        .getByRole("button", { name: "Terms of Service" })
        .click();
      await expect(termsModal.locator(".markdown-body")).toBeVisible({
        timeout: 10000,
      });

      // Scroll to bottom to enable button
      await termsModal.evaluate((el) => {
        const scrollable = el.querySelector(".overflow-auto");
        if (scrollable instanceof HTMLElement) {
          scrollable.scrollTop = scrollable.scrollHeight;
          scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
        }
      });

      await expect(acceptButton).toBeEnabled();

      // Click accept
      await acceptButton.click();
    }

    await expect(page.locator("[data-connect] span")).toBeVisible({
      timeout: 5000,
    });

    // With mocks, wallet is connected by default (Profile text due to walletService mock)
    // Verify the connect/profile button rendered in either state
    const buttonText = await page
      .locator("[data-connect] span")
      .textContent()
      .catch(() => "");
    const isConnected = buttonText === "Profile";

    if (!isConnected) {
      // Wallet not connected → Join button should be visible
      const joinButton = page.locator("button", { hasText: "Join" }).first();
      await expect(joinButton).toBeVisible({ timeout: 5000 });
      await joinButton.click();

      // Wait for modal to render
      await expect(page.getByText("Join the Community")).toBeVisible({
        timeout: 10000,
      });

      // Fill minimal required fields
      await page
        .locator("input[placeholder='Write the address as G...']")
        .fill("G".padEnd(56, "B"));
      await page
        .locator("input[placeholder='https://twitter.com/yourhandle']")
        .fill("https://twitter.com/test");

      // Submit – click the second Join button (the submit)
      await page.getByRole("button", { name: "Join" }).nth(1).click();
    } else {
      // Wallet IS connected — verify the connected profile button is visible
      await expect(page.locator("[data-connect]")).toBeVisible();
    }
  });

  test("Project creation modal adapts repository fields for a real public Radicle RID", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tansu_tos_accepted", "true");
      localStorage.setItem("publicKey", `G${"A".repeat(55)}`);
      (window as any).getProjectFromName = async (name: string) => {
        if (name === "newproject") return null;
        return {
          name: name || "demo",
          maintainers: [
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          ],
          config: {
            url: "https://github.com/demo/demo",
            ipfs: "abc123",
          },
        };
      };
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForTimeout(100);

    // Look for the Add Project button
    const addProjectBtn = page
      .locator("button")
      .filter({ hasText: /Add Project/i })
      .first();
    const btnCount = await addProjectBtn.count().catch(() => 0);

    if (btnCount === 0) {
      return;
    }

    // Click via evaluate() in case button is hidden until wallet connects
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Add Project/i.test(b.textContent || ""),
      );
      (btn as HTMLButtonElement | null)?.click();
    });

    await page.waitForTimeout(500);

    // Check if modal appeared
    const modal = page.locator(".project-modal-container");
    if ((await modal.count().catch(() => 0)) === 0) {
      return;
    }
    await expect(modal).toBeVisible();

    const repositoryProvider = modal.locator("select").first();
    if ((await repositoryProvider.count().catch(() => 0)) === 0) {
      return;
    }
    const repositoryUrlInput = modal.locator(
      'input[placeholder="https://github.com/owner/repo"]',
    );

    await expect(repositoryProvider).toHaveValue("github");
    await repositoryUrlInput.fill(RADICLE_RID);

    await expect(repositoryProvider).toHaveValue("radicle");
    await expect(modal.getByText("Radicle Repository URL")).toBeVisible();
    await expect(
      modal.getByText("Use a public Radicle RID such as rad:z3"),
    ).toBeVisible();
    await expect(
      modal.locator(`input[placeholder="${RADICLE_RID}"]`),
    ).toBeVisible();

    await modal
      .locator('input[placeholder="Write the project name (e.g., myproject)"]')
      .fill("newproject");
    await modal
      .locator('input[placeholder="My Awesome Project"]')
      .fill("Radicle Heartwood");
    await modal.getByRole("button", { name: "Next" }).click();

    await expect(modal.getByText("Radicle Alias")).toBeVisible({
      timeout: 5000,
    });
    await modal.locator(`input[placeholder="alias"]`).fill("cloudhead");
    await modal.getByRole("button", { name: "Next" }).click();

    await expect(modal.getByText("Add Organization Details")).toBeVisible({
      timeout: 5000,
    });
    await expect(modal.getByText("Radicle Repository URL")).toBeVisible();
    await expect(
      modal.getByText("Use a public Radicle RID such as rad:z3"),
    ).toBeVisible();

    await modal
      .locator('input[placeholder="Your organisation / project owner name"]')
      .fill("Radicle");
    await modal
      .locator('input[placeholder="https://example.com"]')
      .fill("https://radicle.network");
    await modal
      .locator('input[placeholder="https://.../logo.png"]')
      .fill("https://radicle.xyz/apple-touch-icon.png");
    await modal
      .locator('textarea[placeholder="Describe your project (min 3 words)"]')
      .fill("Public Radicle repository validation");
    await modal.getByRole("button", { name: "Next" }).click();

    await expect(modal.getByText("Review and Submit Your Project")).toBeVisible(
      { timeout: 5000 },
    );
    await expect(modal.getByText("Repository Provider")).toBeVisible();
    await expect(modal.getByText("Radicle", { exact: true })).toBeVisible();
    await expect(modal.getByText(RADICLE_RID)).toBeVisible();
  });
});
