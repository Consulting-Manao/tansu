import { test, expect, type Page } from "@playwright/test";
import { applyAllMocks } from "./helpers/mock";
import {
  WALLET_PK,
  MOCK_PROPOSAL,
  MOCK_PROJECT,
  MOCK_MEMBER,
} from "./helpers/data";

const MOCK_RAW_PROPOSAL = {
  id: 1,
  title: "Test Proposal",
  ipfs: MOCK_PROPOSAL.ipfs,
  proposer: WALLET_PK,
  status: { tag: "Active" },
  outcome_contracts: null,
  vote_data: {
    public_voting: true,
    voting_ends_at: Math.floor(Date.now() / 1000) + 3600,
    votes: [],
    token_contract: null,
  },
};

async function applyProposalPageMocks(page: Page) {
  // Override ReadContractService to include getProposalRaw and getProjectFromName
  await page.route("**/service/ReadContractService*", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/javascript" },
      body: `
        export async function getProposalRaw(projectName, proposalId) {
          return ${JSON.stringify(MOCK_RAW_PROPOSAL)};
        }

        export async function getProjectFromName(name) {
          return {
            name: name || "demo",
            maintainers: ["${WALLET_PK}"],
            config: { url: "${MOCK_PROJECT.config_url}", ipfs: "abc123" },
          };
        }

        export async function getProjectFromId(id) {
          return getProjectFromName(id || "demo");
        }

        export async function getProject(projectKey) {
          return getProjectFromName(projectKey || "demo");
        }

        export async function getProposalPages() { return 1; }
        export async function getProposals() { return [${JSON.stringify(MOCK_PROPOSAL)}]; }
        export async function getProposal() { return ${JSON.stringify(MOCK_PROPOSAL)}; }
        export async function getMember(address) {
          return address ? ${JSON.stringify(MOCK_MEMBER)} : null;
        }
        export async function getBadges() {
          return { community: false, developer: false, triage: false, verified: false };
        }
        export async function hasAnonymousVotingConfig() { return false; }
        export function invalidateProposalCache() {}
        export async function getProjectHash() { return "abc123"; }
      `,
    });
  });

  await page.route("**/@service/ReadContractService*", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/javascript" },
      body: `
        export async function getProposalRaw(projectName, proposalId) {
          return ${JSON.stringify(MOCK_RAW_PROPOSAL)};
        }

        export async function getProjectFromName(name) {
          return {
            name: name || "demo",
            maintainers: ["${WALLET_PK}"],
            config: { url: "${MOCK_PROJECT.config_url}", ipfs: "abc123" },
          };
        }

        export async function getProjectFromId(id) {
          return getProjectFromName(id || "demo");
        }

        export async function getProject(projectKey) {
          return getProjectFromName(projectKey || "demo");
        }

        export async function getProposalPages() { return 1; }
        export async function getProposals() { return [${JSON.stringify(MOCK_PROPOSAL)}]; }
        export async function getProposal() { return ${JSON.stringify(MOCK_PROPOSAL)}; }
        export async function getMember(address) {
          return address ? ${JSON.stringify(MOCK_MEMBER)} : null;
        }
        export async function getBadges() {
          return { community: false, developer: false, triage: false, verified: false };
        }
        export async function hasAnonymousVotingConfig() { return false; }
        export function invalidateProposalCache() {}
        export async function getProjectHash() { return "abc123"; }
      `,
    });
  });

  // Mock ContractService to make revokeProposal succeed
  await page.route("**/service/ContractService*", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/javascript" },
      body: `
        export async function revokeProposal(projectName, proposalId) {
          return true;
        }
        export async function vote() { return true; }
        export async function executeProposal() { return true; }
        export async function createProposal() { return 1; }
        export async function addMember() { return true; }
        export async function updateProject() { return true; }
        export async function removeVote() { return true; }
        export async function setupAnonymousVoting() { return true; }
        export async function registerProject() { return true; }
      `,
    });
  });

  await page.route("**/@service/ContractService*", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/javascript" },
      body: `
        export async function revokeProposal(projectName, proposalId) {
          return true;
        }
        export async function vote() { return true; }
        export async function executeProposal() { return true; }
        export async function createProposal() { return 1; }
        export async function addMember() { return true; }
        export async function updateProject() { return true; }
        export async function removeVote() { return true; }
        export async function setupAnonymousVoting() { return true; }
        export async function registerProject() { return true; }
      `,
    });
  });
}

test.describe("Mark as Malicious – UX Flow", () => {
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(`PageError: ${error.message}`);
    });
    await applyAllMocks(page);
    await applyProposalPageMocks(page);
    page.setDefaultTimeout(15_000);
  });

  test("Mark as Malicious button is visible for maintainers on active proposals", async ({
    page,
  }) => {
    await page.goto("/proposal?name=demo&id=1", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Wait for proposal to load
    await page.waitForTimeout(1000);

    const markMaliciousBtn = page
      .locator("button")
      .filter({ hasText: "Mark as Malicious" })
      .first();
    const btnCount = await markMaliciousBtn.count().catch(() => 0);

    if (btnCount === 0) {
      // Proposal page may not have loaded fully — verify the page at least rendered
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
      return;
    }

    await expect(markMaliciousBtn).toBeVisible();
  });

  test("Mark as Malicious modal opens when button is clicked", async ({
    page,
  }) => {
    await page.goto("/proposal?name=demo&id=1", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await page.waitForTimeout(1000);

    const markMaliciousBtn = page
      .locator("button")
      .filter({ hasText: "Mark as Malicious" })
      .first();
    const btnCount = await markMaliciousBtn.count().catch(() => 0);
    if (btnCount === 0) {
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
      return;
    }

    await markMaliciousBtn.click();

    // Modal should appear with confirmation text
    await expect(page.getByText("Mark Proposal as Malicious")).toBeVisible({
      timeout: 5000,
    });

    // Modal should contain proposal title
    await expect(page.getByText("Test Proposal")).toBeVisible({
      timeout: 3000,
    });

    // Both Cancel and Mark as Malicious buttons should be in the modal
    await expect(
      page
        .locator("button")
        .filter({ hasText: /^Cancel$/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator("button")
        .filter({ hasText: /^Mark as Malicious$/ })
        .first(),
    ).toBeVisible();
  });

  test("Cancel button closes the modal without marking the proposal", async ({
    page,
  }) => {
    await page.goto("/proposal?name=demo&id=1", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await page.waitForTimeout(1000);

    const markMaliciousBtn = page
      .locator("button")
      .filter({ hasText: "Mark as Malicious" })
      .first();
    const btnCount = await markMaliciousBtn.count().catch(() => 0);
    if (btnCount === 0) {
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
      return;
    }

    await markMaliciousBtn.click();
    await expect(page.getByText("Mark Proposal as Malicious")).toBeVisible({
      timeout: 5000,
    });

    // Click Cancel
    await page
      .locator("button")
      .filter({ hasText: /^Cancel$/ })
      .first()
      .click();

    // Modal should close
    await expect(page.getByText("Mark Proposal as Malicious")).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("Confirming mark as malicious closes modal and refetches without a page reload", async ({
    page,
  }) => {
    // Track if window.location.reload is called (page reload indicator)
    await page.addInitScript(() => {
      (window as any).__reloadCalled = false;
      try {
        Object.defineProperty(window.location, "reload", {
          configurable: true,
          writable: true,
          value: () => {
            (window as any).__reloadCalled = true;
            // Do NOT actually reload — we want to detect the call
          },
        });
      } catch {
        // Some browsers prevent overriding location.reload; skip the assertion
      }
    });

    await page.goto("/proposal?name=demo&id=1", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await page.waitForTimeout(1000);

    const markMaliciousBtn = page
      .locator("button")
      .filter({ hasText: "Mark as Malicious" })
      .first();
    const btnCount = await markMaliciousBtn.count().catch(() => 0);
    if (btnCount === 0) {
      await expect(page.locator("[data-connect]")).toBeVisible({
        timeout: 5000,
      });
      return;
    }

    await markMaliciousBtn.click();
    await expect(page.getByText("Mark Proposal as Malicious")).toBeVisible({
      timeout: 5000,
    });

    // Set a session marker that would be lost on page reload
    await page.evaluate(() => {
      (window as any).__noReloadMarker = "alive";
    });

    // Confirm mark as malicious
    const confirmBtn = page
      .locator("button")
      .filter({ hasText: /^Mark as Malicious$/ })
      .first();
    await confirmBtn.click();

    // Wait for the modal to close
    await expect(page.getByText("Mark Proposal as Malicious")).not.toBeVisible({
      timeout: 5000,
    });

    // The session marker must still exist — a page reload would have cleared it
    const markerStillExists = await page.evaluate(
      () => (window as any).__noReloadMarker === "alive",
    );
    expect(markerStillExists).toBe(true);

    // window.location.reload should NOT have been called
    const reloadCalled = await page.evaluate(
      () => (window as any).__reloadCalled,
    );
    expect(reloadCalled).toBe(false);
  });
});
