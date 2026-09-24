import { expect, test } from "./helpers/app";
import { sshKey } from "./helpers/git";
import { read } from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

test("connect a wallet, join with a git identity and see the profile", async ({
  page,
  wallet,
}) => {
  test.setTimeout(180_000);
  const key = sshKey("ada");

  await page.goto("/");
  await connectWallet(page);
  await page.getByRole("button", { name: "Open user profile" }).click();
  await expect(page.getByText("Member Not Registered")).toBeVisible();
  await page.getByRole("button", { name: "Register Now" }).click();
  await page.getByPlaceholder("Enter your name").fill("Ada");
  await page
    .getByPlaceholder("Tell us about yourself...")
    .fill("Writes Soroban contracts.");

  // The git handle is proven with an SSH signature over the member address.
  await page
    .getByRole("button", { name: "+ Link Git Handle (optional)" })
    .click();
  await page
    .getByRole("button", { name: "Link Git Handle", exact: true })
    .click();
  await page.getByText("Custom", { exact: true }).click();
  await page
    .getByPlaceholder("Provider name (e.g., radicle, bitbucket)")
    .fill("codeberg");
  await page.getByPlaceholder("Username / identifier").fill("ada");
  await page
    .getByPlaceholder("Paste your Ed25519 SSH public key (ssh-ed25519 AAAA...)")
    .fill(key.line);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const signature = page.getByPlaceholder("Paste the raw base64 signature");
  await signature.fill(key.sign(wallet.publicKey(), "codeberg:someone-else"));
  await page.getByRole("button", { name: "Verify Signature" }).click();
  await expect(page.getByTestId("sig-error")).toContainText(
    "Signature verification failed",
  );
  await signature.fill(key.sign(wallet.publicKey(), "codeberg:ada"));
  await page.getByRole("button", { name: "Verify Signature" }).click();
  await expect(page.getByText("Git Identity Verified")).toBeVisible();

  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Welcome aboard!")).toBeVisible({
    timeout: 120_000,
  });
  expect(await read.member(wallet.publicKey())).toMatchObject({
    git_identity: "codeberg:ada",
  });

  // The profile reads the new member from the chain, without a reload.
  await page.evaluate(() => ((window as any).stayed = true));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Open user profile" }).click();
  await expect(page.getByText("codeberg:ada")).toBeVisible();
  await expect(page.getByText("Writes Soroban contracts.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).stayed)).toBe(true);
});
