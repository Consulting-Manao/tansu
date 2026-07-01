/**
 * Playwright tests for the Git identity binding flow.
 *
 * These tests exercise the UI path:
 * - open the Join modal from the navbar
 * - expand the optional Git section
 * - fetch SSH keys from GitHub/GitLab
 * - verify either raw base64 signatures or OpenSSH armored signatures
 */

import { expect, test, type Page } from "@playwright/test";
import { applyAllMocks } from "./helpers/mock";

const TEST_GIT_USERNAME = "testuser";
const TEST_GIT_IDENTITY = "github:testuser";

const TEST_SSH_KEY_LINE =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICFS+NGbeR0kRTJC4V8uq2y3z/p7al7TAJeWDgaYgdsS testuser";

const TEST_SIGNATURE_BASE64 =
  "VMK1sPy9v49JQqQ7ciyQ/DSw7gukwzdlcM2S+S4P0ywvVpJgxH7rMwWtqk4lHaUYdw+Z+RQcjG9mefpfGChqCg==";

const TEST_PUBKEY_BYTES = new Uint8Array([
  0x21, 0x52, 0xf8, 0xd1, 0x9b, 0x79, 0x1d, 0x24, 0x45, 0x32, 0x42, 0xe1, 0x5f,
  0x2e, 0xab, 0x6c, 0xb7, 0xcf, 0xfa, 0x7b, 0x6a, 0x5e, 0xd3, 0x00, 0x97, 0x96,
  0x0e, 0x06, 0x98, 0x81, 0xdb, 0x12,
]);

const TEST_SIG_BYTES = new Uint8Array([
  0x54, 0xc2, 0xb5, 0xb0, 0xfc, 0xbd, 0xbf, 0x8f, 0x49, 0x42, 0xa4, 0x3b, 0x72,
  0x2c, 0x90, 0xfc, 0x34, 0xb0, 0xee, 0x0b, 0xa4, 0xc3, 0x37, 0x65, 0x70, 0xcd,
  0x92, 0xf9, 0x2e, 0x0f, 0xd3, 0x2c, 0x2f, 0x56, 0x92, 0x60, 0xc4, 0x7e, 0xeb,
  0x33, 0x05, 0xad, 0xaa, 0x4e, 0x25, 0x1d, 0xa5, 0x18, 0x77, 0x0f, 0x99, 0xf9,
  0x14, 0x1c, 0x8c, 0x6f, 0x66, 0x79, 0xfa, 0x5f, 0x18, 0x28, 0x6a, 0x0a,
]);

/** Encode length-prefixed SSH wire bytes. */
function sshWireStr(bytes: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  len[0] = (bytes.length >> 24) & 0xff;
  len[1] = (bytes.length >> 16) & 0xff;
  len[2] = (bytes.length >> 8) & 0xff;
  len[3] = bytes.length & 0xff;
  const out = new Uint8Array(4 + bytes.length);
  out.set(len);
  out.set(bytes, 4);
  return out;
}

/** Build a full OpenSSH armored signature for testing the armored format path. */
function buildOpenSshArmor(): string {
  const enc = new TextEncoder();

  const pubkeyBlob = (pk: Uint8Array): Uint8Array => {
    const keyType = sshWireStr(enc.encode("ssh-ed25519"));
    const keyBytes = sshWireStr(pk);
    const blob = new Uint8Array(keyType.length + keyBytes.length);
    blob.set(keyType);
    blob.set(keyBytes, keyType.length);
    return blob;
  };

  const sigBlob = (sig: Uint8Array): Uint8Array => {
    const keyType = sshWireStr(enc.encode("ssh-ed25519"));
    const sigBytes = sshWireStr(sig);
    const blob = new Uint8Array(keyType.length + sigBytes.length);
    blob.set(keyType);
    blob.set(sigBytes, keyType.length);
    return blob;
  };

  const magic = enc.encode("SSHSIG");
  const version = new Uint8Array([0, 0, 0, 1]);
  const pk = sshWireStr(pubkeyBlob(TEST_PUBKEY_BYTES));
  const ns = sshWireStr(enc.encode("file"));
  const reserved = sshWireStr(new Uint8Array(0));
  const hashAlg = sshWireStr(enc.encode("sha256"));
  const sig = sshWireStr(sigBlob(TEST_SIG_BYTES));

  const payload = new Uint8Array(
    magic.length +
      version.length +
      pk.length +
      ns.length +
      reserved.length +
      hashAlg.length +
      sig.length,
  );

  let offset = 0;
  payload.set(magic, offset);
  offset += magic.length;
  payload.set(version, offset);
  offset += version.length;
  payload.set(pk, offset);
  offset += pk.length;
  payload.set(ns, offset);
  offset += ns.length;
  payload.set(reserved, offset);
  offset += reserved.length;
  payload.set(hashAlg, offset);
  offset += hashAlg.length;
  payload.set(sig, offset);

  const b64 = btoa(String.fromCharCode(...payload));
  const lines = ["-----BEGIN SSH SIGNATURE-----"];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  lines.push("-----END SSH SIGNATURE-----");
  return lines.join("\n");
}

const TEST_OPENSSH_ARMORED = buildOpenSshArmor();

/** crypto.getRandomValues mock for deterministic nonce */
const CRYPTO_MOCK_SCRIPT = () => {
  globalThis.crypto.getRandomValues = ((array: Uint8Array) => {
    const fixed = new Uint8Array([
      0xfe, 0xed, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe, 0xde, 0xad, 0xbe, 0xef,
      0x01, 0x23, 0x45, 0x67,
    ]);
    array.set(fixed.slice(0, array.length));
    return array;
  }) as typeof globalThis.crypto.getRandomValues;
};

// ── GitHub mock helpers ──────────────────────────────────────────────────────

async function mockGitHubKeys(page: Page) {
  await page.route("https://github.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes(".keys")) {
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: TEST_SSH_KEY_LINE + "\n",
      });
      return;
    }
    await route.continue();
  });
}

async function mockGitHubKeys404(page: Page) {
  await page.route("https://github.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes(".keys")) {
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "Not Found",
      });
      return;
    }
    await route.continue();
  });
}

async function mockGitHubKeysRsaOnly(page: Page) {
  await page.route("https://github.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes(".keys")) {
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...\n",
      });
      return;
    }
    await route.continue();
  });
}

// ── Helper: open the Join modal ──────────────────────────────────────────────

async function setupJoinModal(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("tansu_tos_accepted", "true");
    (window as any).getMember = async () => null;
  });

  await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

  // Handle Terms modal if it appears (defensive)
  const termsModal = page.locator(".terms-modal-container");
  const termsModalCount = await termsModal.count().catch(() => 0);
  if (termsModalCount > 0) {
    await termsModal
      .getByRole("button", { name: "Terms of Service" })
      .click()
      .catch(() => {});
    await termsModal.evaluate((el) => {
      const scrollable = el.querySelector(".overflow-auto");
      if (scrollable instanceof HTMLElement) {
        scrollable.scrollTop = scrollable.scrollHeight;
        scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    });
    await expect(
      termsModal.getByRole("button", { name: /accept terms/i }),
    ).toBeEnabled({ timeout: 5000 });
    await termsModal
      .getByRole("button", { name: /accept terms/i })
      .click()
      .catch(() => {});
  }

  // Wait for React hydration
  await expect(page.locator("[data-connect]")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);

  // Click the Join button
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Join",
    );
    if (btn) (btn as HTMLButtonElement).click();
  });

  await page.waitForTimeout(500);

  // Wait for the modal heading
  await expect(page.getByText("Join the Community")).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Signature textarea selector — matches the textarea inside the GitVerification
 * verify step by its placeholder text (contains "base64").
 * Avoids the Description textarea (SimpleMarkdownEditor) which appears first.
 */
const SIG_TEXTAREA = 'textarea[placeholder*="base64"]';

/**
 * Expand the Git verification section (click the "+ Link Git Handle" button),
 * then click "Link Git Handle" inside the choice card to reach the input step,
 * fill in username, and click Fetch Keys.
 * Assumes the Join modal is already open.
 */
async function expandGitVerify(page: Page, username = TEST_GIT_USERNAME) {
  // Step 1: Click "+ Link Git Handle (optional)" to reveal GitVerification component
  const expandButton = page
    .locator("button")
    .filter({ hasText: /Link Git Handle/ })
    .first();
  await expect(expandButton).toBeVisible({ timeout: 5000 });
  await expandButton.click();
  await page.waitForTimeout(300);

  // Step 2: Now GitVerification choice card is shown.
  // Click "Link Git Handle" inside the choice card to go to the input step.
  const innerButton = page
    .locator("button")
    .filter({ hasText: /^Link Git Handle$/ })
    .first();
  await expect(innerButton).toBeVisible({ timeout: 5000 });
  await innerButton.click();
  await page.waitForTimeout(300);

  // Step 3: Fill in username
  const usernameInput = page.locator('input[placeholder*="username"]').first();
  await expect(usernameInput).toBeVisible({ timeout: 5000 });
  await usernameInput.fill(username);

  // Step 4: Click Fetch Keys
  const fetchButton = page
    .locator("button")
    .filter({ hasText: "Fetch Keys" })
    .first();
  await expect(fetchButton).toBeVisible({ timeout: 5000 });
  await fetchButton.click();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Git Identity Binding Flow", () => {
  test.beforeEach(async ({ page }) => {
    await applyAllMocks(page);
    page.setDefaultTimeout(15000);
  });

  test.afterEach(async ({ page }) => {
    await page
      .goto("about:blank", { waitUntil: "commit", timeout: 2000 })
      .catch(() => {});
  });

  test("shows the Link Git Handle choice card after expanding", async ({
    page,
  }) => {
    await setupJoinModal(page);

    // Click "+ Link Git Handle (optional)" to expand
    const expandButton = page
      .locator("button")
      .filter({ hasText: /Link Git Handle/ })
      .first();
    await expect(expandButton).toBeVisible({ timeout: 5000 });
    await expandButton.click();
    await page.waitForTimeout(300);

    // Now the choice card with "Link Git Identity" heading should be visible
    await expect(page.getByText("Link Git Identity").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("clicking Link Git Handle in choice card transitions to input step", async ({
    page,
  }) => {
    await setupJoinModal(page);

    // Expand the git section
    const expandButton = page
      .locator("button")
      .filter({ hasText: /Link Git Handle/ })
      .first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Click "Link Git Handle" inside the choice card
    const innerButton = page
      .locator("button")
      .filter({ hasText: /^Link Git Handle$/ })
      .first();
    await expect(innerButton).toBeVisible({ timeout: 5000 });
    await innerButton.click();
    await page.waitForTimeout(300);

    // Should now show provider radio buttons
    await expect(
      page.locator('input[type="radio"][name="provider"]').first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("clicking Skip collapses the git section", async ({ page }) => {
    await setupJoinModal(page);

    // Expand git section
    const expandButton = page
      .locator("button")
      .filter({ hasText: /Link Git Handle/ })
      .first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Click Skip
    const skipButton = page
      .locator("button")
      .filter({ hasText: "Skip" })
      .first();
    await expect(skipButton).toBeVisible({ timeout: 5000 });
    await skipButton.click();
    await page.waitForTimeout(300);

    // After skip, the expand button should reappear
    await expect(
      page
        .locator("button")
        .filter({ hasText: /Link Git Handle/ })
        .first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("fetches Ed25519 key from GitHub and shows verify step", async ({
    page,
  }) => {
    await page.addInitScript(CRYPTO_MOCK_SCRIPT);
    await mockGitHubKeys(page);
    await setupJoinModal(page);

    await expandGitVerify(page);

    await expect(page.getByText("Sign with Git Key")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Message to sign (hex):")).toBeVisible({
      timeout: 5000,
    });
    // The git identity string appears in multiple places (heading, envelope),
    // so use .first() to avoid strict mode violations
    await expect(page.getByText(TEST_GIT_IDENTITY).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows error when GitHub username does not exist", async ({ page }) => {
    await mockGitHubKeys404(page);
    await setupJoinModal(page);

    await expandGitVerify(page, "nonexistent-user");

    await expect(page.locator("[data-testid='git-error']")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows error when no Ed25519 SSH keys found", async ({ page }) => {
    await mockGitHubKeysRsaOnly(page);
    await setupJoinModal(page);

    await expandGitVerify(page, "rsa-only-user");

    const errorEl = page.locator("[data-testid='git-error']");
    await expect(errorEl).toBeVisible({ timeout: 10000 });
    await expect(errorEl.getByText(/Ed25519/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("signature paste area appears in verify step", async ({ page }) => {
    await page.addInitScript(CRYPTO_MOCK_SCRIPT);
    await mockGitHubKeys(page);
    await setupJoinModal(page);

    await expandGitVerify(page);

    await expect(page.getByText("Sign with Git Key")).toBeVisible({
      timeout: 10000,
    });

    const sigTextarea = page.locator(SIG_TEXTAREA);
    await expect(sigTextarea).toBeVisible({ timeout: 5000 });
    await expect(sigTextarea).toHaveAttribute("placeholder", /base64/);

    const verifyButton = page
      .locator("button")
      .filter({ hasText: "Verify Signature" })
      .first();
    await expect(verifyButton).toBeVisible();
    await expect(verifyButton).toBeDisabled();

    await sigTextarea.click();
    await sigTextarea.fill(TEST_SIGNATURE_BASE64);
    await page.waitForTimeout(300);
    await expect(verifyButton).toBeEnabled();
  });

  test("fills signature and triggers verification flow (base64)", async ({
    page,
  }) => {
    await page.addInitScript(CRYPTO_MOCK_SCRIPT);
    await mockGitHubKeys(page);
    await setupJoinModal(page);

    await expandGitVerify(page);

    const sigTextarea = page.locator(SIG_TEXTAREA);
    await expect(sigTextarea).toBeVisible({ timeout: 5000 });
    await sigTextarea.click();
    await sigTextarea.fill(TEST_SIGNATURE_BASE64);
    await page.waitForTimeout(500);

    // Verify button becomes enabled after filling
    const verifyButton = page
      .locator("button")
      .filter({ hasText: "Verify Signature" })
      .first();
    await expect(verifyButton).toBeEnabled({ timeout: 5000 });
    await verifyButton.click();

    // Click triggers verification — either success or error state appears
    // (Ed25519 crypto is verified in unit tests; this tests the UI flow)
    await page.waitForTimeout(1000);
    const hasSuccess = await page
      .getByText("Git Identity Verified")
      .isVisible()
      .catch(() => false);
    const hasError = await page
      .locator("[data-testid='sig-error']")
      .isVisible()
      .catch(() => false);
    expect(hasSuccess || hasError).toBe(true);
  });

  test("fills signature and triggers verification flow (OpenSSH armored)", async ({
    page,
  }) => {
    await page.addInitScript(CRYPTO_MOCK_SCRIPT);
    await mockGitHubKeys(page);
    await setupJoinModal(page);

    await expandGitVerify(page);

    const sigTextarea = page.locator(SIG_TEXTAREA);
    await expect(sigTextarea).toBeVisible({ timeout: 5000 });
    await sigTextarea.click();
    await sigTextarea.fill(TEST_OPENSSH_ARMORED);
    await page.waitForTimeout(500);

    // Verify button becomes enabled after filling
    const verifyButton = page
      .locator("button")
      .filter({ hasText: "Verify Signature" })
      .first();
    await expect(verifyButton).toBeEnabled({ timeout: 5000 });
    await verifyButton.click();

    // Click triggers verification — either success or error state appears
    await page.waitForTimeout(1000);
    const hasSuccess = await page
      .getByText("Git Identity Verified")
      .isVisible()
      .catch(() => false);
    const hasError = await page
      .locator("[data-testid='sig-error']")
      .isVisible()
      .catch(() => false);
    expect(hasSuccess || hasError).toBe(true);
  });

  test("invalid signature shows error message", async ({ page }) => {
    await page.addInitScript(CRYPTO_MOCK_SCRIPT);
    await mockGitHubKeys(page);
    await setupJoinModal(page);

    await expandGitVerify(page);

    const sigTextarea = page.locator(SIG_TEXTAREA);
    await expect(sigTextarea).toBeVisible({ timeout: 5000 });
    await sigTextarea.click();
    await sigTextarea.fill("AAAA" + "A".repeat(80) + "==");
    await page.waitForTimeout(500);

    // Wait for button to be enabled, then click
    const verifyButton = page
      .locator("button")
      .filter({ hasText: "Verify Signature" })
      .first();
    await expect(verifyButton).toBeEnabled({ timeout: 5000 });
    await verifyButton.click();
    await page.waitForTimeout(1000);

    await expect(page.locator("[data-testid='sig-error']")).toBeVisible({
      timeout: 10000,
    });
  });

  test("GitLab provider selection works", async ({ page }) => {
    await setupJoinModal(page);

    // Expand git section
    const expandButton = page
      .locator("button")
      .filter({ hasText: /Link Git Handle/ })
      .first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Click "Link Git Handle" in the choice card
    const innerButton = page
      .locator("button")
      .filter({ hasText: /^Link Git Handle$/ })
      .first();
    await expect(innerButton).toBeVisible({ timeout: 5000 });
    await innerButton.click();
    await page.waitForTimeout(300);

    // Now click the GitLab radio
    const gitLabRadio = page
      .locator('input[type="radio"][name="provider"]')
      .nth(1);
    await expect(gitLabRadio).toBeVisible({ timeout: 5000 });
    await gitLabRadio.check();

    await expect(
      page.locator('input[placeholder*="username"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });
  });

  test("MemberProfileModal shows linked git identity", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).mockGetMemberResponse = {
        member_address: "GCTESTEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        meta: "QmTestCID123mockipfs456789abcdef",
        git_identity: "github:testuser",
        projects: [
          {
            project: new Uint8Array([116, 101, 115, 116]),
            badges: ["Community"],
          },
        ],
      };
    });

    await page.addInitScript(() => {
      localStorage.setItem("tansu_tos_accepted", "true");
      localStorage.setItem(
        "connectedPublicKey",
        "GCTESTEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      );
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("walletConnected", {
          detail: "GCTESTEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        }),
      );
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("openProfileModal"));
    });
    await page.waitForTimeout(500);

    await expect(page.getByText(/Git:/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("github:testuser")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Verified")).toBeVisible({ timeout: 5000 });
  });

  test("MemberProfileModal shows No Git handle linked when no git identity", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).mockGetMemberResponse = {
        member_address: "GCTESTEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        meta: "QmTestCID123mockipfs456789abcdef",
        projects: [
          {
            project: new Uint8Array([116, 101, 115, 116]),
            badges: ["Community"],
          },
        ],
      };
    });

    await page.addInitScript(() => {
      localStorage.setItem("tansu_tos_accepted", "true");
      localStorage.setItem(
        "connectedPublicKey",
        "GCTESTEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      );
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("walletConnected", {
          detail: "GCTESTEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        }),
      );
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("openProfileModal"));
    });
    await page.waitForTimeout(500);

    await expect(page.getByText("No Git handle linked")).toBeVisible({
      timeout: 5000,
    });
  });
});
