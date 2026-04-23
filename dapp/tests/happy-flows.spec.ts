import { test, expect } from "@playwright/test";
import { applyAllMocks } from "./helpers/mock";

/*
 * Additional happy-path coverage for the most critical user flows.
 * These tests focus on flow robustness rather than visual assertions.
 */

test.describe("Tansu dApp – Happy-path User Flows", () => {
  test.beforeEach(async ({ page }) => {
    await applyAllMocks(page);
    page.setDefaultTimeout(5_000);
  });

  test.afterEach(async ({ page }) => {
    // Clean up any open modals or state
    try {
      // Close any open modals by clicking escape or close buttons
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);

      // Also try to close any visible modals
      const closeButtons = page.locator("button", {
        hasText: /Close|Cancel|×/,
      });
      if ((await closeButtons.count()) > 0) {
        await closeButtons.first().click();
        await page.waitForTimeout(100);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test("Project creation modal – basic functionality", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tansu_tos_accepted", "true");
      localStorage.setItem("publicKey", `G${"A".repeat(55)}`);
    });

    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
    } catch {
      await page.goto("/").catch(() => {});
    }

    // Wait for page to be ready
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    const addProjectBtn = page
      .locator("button:visible")
      .filter({ hasText: "Add Project" })
      .first();

    await expect(addProjectBtn).toBeVisible();
    await addProjectBtn.click();

    await page.waitForSelector(".project-modal-container", { timeout: 10000 });
    await expect(page.locator(".project-modal-container")).toBeVisible();

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
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("tansu_tos_accepted"));
    await page.reload();
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    const termsModal = page.locator(".terms-modal-container");
    await expect(termsModal).toBeVisible({ timeout: 5000 });

    // Summary tab is default; switch to Full Terms of Service
    await termsModal.getByRole("button", { name: "Terms of Service" }).click();
    await page.waitForTimeout(500);
    // Wait for full terms content to load (fetch)
    await expect(termsModal.locator(".markdown-body")).toBeVisible({
      timeout: 10000,
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
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
    } catch {
      await page.goto("/").catch(() => {});
    }

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Handle TermsAcceptanceModal if it appears
    const termsModal = page.locator(".terms-modal-container");
    const acceptButton = termsModal.getByRole("button", {
      name: /accept terms/i,
    });

    // Wait for modal to appear
    if (await termsModal.isVisible({ timeout: 3000 })) {
      await termsModal
        .getByRole("button", { name: "Terms of Service" })
        .click();
      await expect(termsModal.locator(".markdown-body")).toBeVisible({
        timeout: 10000,
      });

      // Scroll to bottom to enable button
      await termsModal.evaluate((el) => {
        const scrollable = el.querySelector(".overflow-auto");
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      });

      await page.waitForTimeout(200);
      await expect(acceptButton).toBeEnabled();

      // Click accept
      await acceptButton.click();
    }

    // Check if wallet is connected by inspecting the connect button text
    const connectButtonText = await page
      .locator("[data-connect] span")
      .textContent();
    const isConnected = connectButtonText === "Profile";

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

      // Wait a bit for async flow – just assert no crash
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    } else {
      console.log("Wallet already connected, skipping Join button test.");
    }
  });
});
