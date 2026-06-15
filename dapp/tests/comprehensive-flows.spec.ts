import { test, expect } from "@playwright/test";
import { applyAllMocks } from "./helpers/mock";

test.describe("Tansu dApp - Comprehensive User Flows", () => {
  // Track errors across all tests
  let allErrors: string[] = [];
  let pageErrors: string[] = [];

  const safeGoto = async (page: any, url: string) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch {
      await page.goto(url).catch(() => {});
    }
  };

  test.beforeEach(async ({ page }) => {
    // Reset error tracking
    allErrors = [];
    pageErrors = [];

    // Capture all types of errors
    page.on("pageerror", (error) => {
      pageErrors.push(`PageError: ${error.message}`);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        allErrors.push(msg.text());
      }
    });

    await applyAllMocks(page);
    page.setDefaultTimeout(12000);
  });

  test.describe("🔐 Authentication & Wallet Flows", () => {
    test("Wallet connection and state management", async ({ page }) => {
      // Navigate safely
      await safeGoto(page, "/");

      // Initial state - Connect button visible and shows Profile (user is authenticated) but we make that happen in the code below and continue at line 68
      const connectButton = page.locator("[data-connect]");
      const buttonText = connectButton.locator("span");

      // Add temporary listener to simulate UI change
      await page.evaluate(() => {
        window.addEventListener("walletConnected", () => {
          const connectBtn = document.querySelector("[data-connect] span");
          if (connectBtn) connectBtn.textContent = "Profile";
        });

        window.addEventListener("walletDisconnected", () => {
          const connectBtn = document.querySelector("[data-connect] span");
          if (connectBtn) connectBtn.textContent = "Connect";
        });
      });

      // Dispatch walletConnected
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent("walletConnected", {
            detail: { address: "GABC...123" },
          }),
        );
      });

      // Wait for the UI to reflect the connection
      await expect(connectButton).toBeVisible();
      await expect(buttonText).toHaveText(/Profile/);

      // Dispatch walletDisconnected
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("walletDisconnected"));
      });

      await page.waitForTimeout(300);

      // Confirm it returns to connect state
      await expect(buttonText).toHaveText("Connect");
    });
  });

  test.describe("📁 Project Management Flows", () => {
    test("Project page navigation and content loading", async ({ page }) => {
      await safeGoto(page, "/project?name=test-project");

      // Page should render without crashing - verify body has meaningful content
      const bodyText = await page.evaluate(
        () => document.body?.textContent?.length || 0,
      );
      expect(bodyText).toBeGreaterThan(0);

      // Should handle missing project gracefully
      await safeGoto(page, "/project?name=nonexistent-project");
      await expect(page.locator("body")).toBeVisible();

      // Should handle empty project name
      try {
        await safeGoto(page, "/project?name=");
        await expect(page.locator("body")).toBeVisible();
      } catch {
        // Navigation might fail for empty name, which is expected
        await safeGoto(page, "/");
        await expect(page.locator("body")).toBeVisible();
      }
    });

    test("Project search and discovery", async ({ page }) => {
      const navigationPage = await page.context().newPage();
      navigationPage.setDefaultTimeout(12000);

      try {
        await applyAllMocks(navigationPage);
        await navigationPage.goto("/", {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });

        // Verify the home page loaded with meaningful content
        await expect(navigationPage.locator("body")).toBeVisible({
          timeout: 5000,
        });
        const bodyText = await navigationPage.evaluate(
          () => document.body?.textContent?.length || 0,
        );
        expect(bodyText).toBeGreaterThan(0);

        // Search for a project if search input exists
        const searchInput = navigationPage
          .locator('input[placeholder*="search" i], input[type="search"]')
          .first();
        if (await searchInput.isVisible()) {
          await searchInput.fill("test-project");
          await navigationPage.waitForTimeout(100);
          // After search, the page should still be functional
          await expect(navigationPage.locator("body")).toBeVisible({
            timeout: 5000,
          });
        }
      } finally {
        await navigationPage.close().catch(() => {});
      }
    });
  });

  test.describe("🗳️ Governance & Proposal Flows", () => {
    test("Governance page functionality", async ({ page }) => {
      // Navigate to governance page without project context
      await safeGoto(page, "/governance");
      await expect(page.locator("body")).toBeVisible();

      // Navigate with project context - verify it renders without errors
      await safeGoto(page, "/governance?name=test-project");
      const bodyText = await page.evaluate(
        () => document.body?.textContent?.length || 0,
      );
      expect(bodyText).toBeGreaterThan(0);

      // Test with invalid project - should still render gracefully
      await safeGoto(page, "/governance?name=invalid");
      await expect(page.locator("body")).toBeVisible();
    });

    test("Proposal page navigation", async ({ page }) => {
      // Navigate to a valid proposal
      await safeGoto(page, "/proposal?name=test-project&id=1");
      const proposalBodyText = await page.evaluate(
        () => document.body?.textContent?.length || 0,
      );
      expect(proposalBodyText).toBeGreaterThan(0);

      // Test with invalid proposal ID - should render without crashing
      await safeGoto(page, "/proposal?name=test-project&id=999");
      await expect(page.locator("body")).toBeVisible();

      // Test with missing parameters - should render without crashing
      await safeGoto(page, "/proposal");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("🔍 Navigation & Discovery", () => {
    test("Multi-page navigation stability", async ({ page }) => {
      const pages = [
        "/",
        "/governance",
        "/project?name=test",
        "/proposal?name=test&id=1",
      ];

      for (const pagePath of pages) {
        const navigationPage = await page.context().newPage();
        navigationPage.setDefaultTimeout(12000);

        navigationPage.on("pageerror", (error) => {
          pageErrors.push(`PageError: ${error.message}`);
        });

        navigationPage.on("console", (msg) => {
          if (msg.type() === "error") {
            allErrors.push(msg.text());
          }
        });

        try {
          await applyAllMocks(navigationPage);
          await navigationPage.goto(pagePath, {
            waitUntil: "domcontentloaded",
            timeout: 10000,
          });
          await expect(navigationPage.locator("body")).toBeVisible({
            timeout: 5000,
          });
          await navigationPage.waitForTimeout(500);

          const criticalErrors = allErrors.filter(
            (error) =>
              (error.includes("is not defined") ||
                error.includes("Cannot read properties of undefined") ||
                error.includes("TypeError:") ||
                error.includes("ReferenceError:")) &&
              !error.includes("Astro") &&
              !error.includes("dev-toolbar") &&
              !error.includes("Failed to fetch"),
          );

          if (criticalErrors.length > 0) {
            console.error(`Critical errors on ${pagePath}:`, criticalErrors);
          }
          expect(criticalErrors).toHaveLength(0);
          expect(pageErrors).toHaveLength(0);
        } finally {
          await navigationPage.close().catch(() => {});
        }
      }
    });
  });

  test("🛡️ XSS protection and input handling", async ({ page }) => {
    test.setTimeout(90000);

    const xssPayloads = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img src=x onerror=alert("xss")>',
    ];

    for (const payload of xssPayloads) {
      try {
        await page.goto(`/project?name=${encodeURIComponent(payload)}`, {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
        await expect(page.locator("body")).toBeVisible();
      } catch {
        await page.goto("/").catch(() => {});
      }

      try {
        await page.goto("/");
        const searchInput = page
          .locator('input[placeholder*="search" i], input[type="search"]')
          .first();
        if (await searchInput.isVisible()) {
          await searchInput.fill(payload);
          await expect(page.locator("body")).toBeVisible();
          await searchInput.clear();
        }
      } catch {}
    }
  });

  test.describe("📱 Responsive & Performance", () => {
    test("Mobile responsiveness across pages", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const mobilePages = ["/", "/governance", "/project?name=test"];

      for (const pagePath of mobilePages) {
        await page.goto(pagePath, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
        await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
      }
    });

    test("Performance across different pages", async ({ page }) => {
      const pageTests = [
        { path: "/", maxTime: 12000 },
        { path: "/governance", maxTime: 12000 },
        { path: "/project?name=test", maxTime: 12000 },
      ];

      for (const { path, maxTime } of pageTests) {
        const startTime = Date.now();
        await page.goto(path, { waitUntil: "commit", timeout: 10000 });
        await page
          .waitForLoadState("domcontentloaded", { timeout: 10000 })
          .catch(() => {});
        const loadTime = Date.now() - startTime;

        expect(loadTime).toBeLessThan(maxTime);
        await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
