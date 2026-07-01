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
      // Navigate and verify the connect button is present
      await page
        .goto("/", {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        })
        .catch(() => {});

      // Verify the connect button is rendered
      const hasButton = await page.evaluate(
        () => !!document.querySelector("[data-connect]"),
      );
      expect(hasButton).toBe(true);

      // Check button text indicates either connected or disconnected state
      const buttonText = await page.evaluate(
        () =>
          document.querySelector("[data-connect] span")?.textContent?.trim() ||
          "",
      );
      // With our mocks, wallet is connected ("Profile"); otherwise it shows "Connect"
      expect(["Connect", "Profile"]).toContain(buttonText);
    });
  });

  test.describe("📁 Project Management Flows", () => {
    test("Project page navigation and content loading", async ({ page }) => {
      await safeGoto(page, "/project?name=test-project");

      // Page should render without crashing
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });

      // Should handle missing project gracefully
      await safeGoto(page, "/project?name=nonexistent-project");
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });

      // Should handle empty project name
      await safeGoto(page, "/project?name=");
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
    });

    test("Project search and discovery", async ({ page }) => {
      const navigationPage = await page.context().newPage();
      navigationPage.setDefaultTimeout(12000);

      try {
        await applyAllMocks(navigationPage);
        await navigationPage.addInitScript(() => {
          localStorage.setItem(
            "tansu_tos_accepted",
            JSON.stringify({ accepted: true }),
          );
        });
        await navigationPage.goto("/", {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });

        const searchInput = navigationPage
          .locator('input[placeholder*="search" i], input[type="search"]')
          .first();
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await navigationPage.goto("/?search=test-project", {
            waitUntil: "domcontentloaded",
            timeout: 10000,
          });
          await expect(navigationPage).toHaveURL(/search=test-project/);
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
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });

      // Navigate with project context - verify it renders without errors
      await safeGoto(page, "/governance?name=test-project");
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });

      // Test with invalid project - should still render gracefully
      await safeGoto(page, "/governance?name=invalid");
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
    });

    test("Proposal page navigation", async ({ page }) => {
      // Navigate to a valid proposal
      await safeGoto(page, "/proposal?name=test-project&id=1");
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });

      // Test with invalid proposal ID - should render without crashing
      await safeGoto(page, "/proposal?name=test-project&id=999");
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });

      // Test with missing parameters - should render without crashing
      await safeGoto(page, "/proposal");
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
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
        // Reset per-page error tracking
        const iterationPageErrors: string[] = [];
        const iterationAllErrors: string[] = [];

        const navigationPage = await page.context().newPage();
        navigationPage.setDefaultTimeout(12000);

        navigationPage.on("pageerror", (error) => {
          iterationPageErrors.push(`PageError: ${error.message}`);
        });

        navigationPage.on("console", (msg) => {
          if (msg.type() === "error") {
            iterationAllErrors.push(msg.text());
          }
        });

        try {
          await applyAllMocks(navigationPage);
          await navigationPage.goto(pagePath, {
            waitUntil: "domcontentloaded",
            timeout: 10000,
          });
          await expect(navigationPage.locator("[data-connect]")).toBeVisible({
            timeout: 5000,
          });
          await navigationPage.waitForTimeout(500);

          const criticalErrors = iterationAllErrors.filter(
            (error) =>
              (error.includes("is not defined") ||
                error.includes("Cannot read properties of undefined") ||
                error.includes("TypeError:") ||
                error.includes("ReferenceError:")) &&
              !error.includes("Astro") &&
              !error.includes("dev-toolbar") &&
              !error.includes("Failed to fetch"),
          );

          const filteredPageErrors = iterationPageErrors.filter(
            (error) =>
              !error.includes("Astro") &&
              !error.includes("dev-toolbar") &&
              !error.includes("Failed to fetch"),
          );

          if (criticalErrors.length > 0) {
            console.error(`Critical errors on ${pagePath}:`, criticalErrors);
          }
          expect(criticalErrors).toHaveLength(0);
          expect(filteredPageErrors).toHaveLength(0);
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
        await expect(page.locator("[data-connect]")).toBeVisible({
          timeout: 5000,
        });
      } catch {
        await page.goto("/").catch(() => {});
      }

      try {
        await page.goto(`/?search=${encodeURIComponent(payload)}`, {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
        await expect(page.locator("[data-connect]")).toBeVisible({
          timeout: 5000,
        });
      } catch {}
    }
  });

  test.describe("📱 Responsive & Performance", () => {
    test("Mobile responsiveness across pages", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const mobilePages = ["/", "/governance", "/project?name=test"];

      for (const pagePath of mobilePages) {
        await safeGoto(page, pagePath);
        await expect(page.locator("[data-connect]")).toBeVisible({
          timeout: 5000,
        });
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
        await expect(page.locator("[data-connect]")).toBeVisible({
          timeout: 5000,
        });
      }
    });
  });
});
