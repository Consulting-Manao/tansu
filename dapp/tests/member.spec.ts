import { expect, test } from "./helpers/app";
import { sshKey } from "./helpers/git";
import { connectWallet } from "./helpers/wallet";

test.use({ member: false });

test("connect a wallet, join with a git identity and see the profile", async ({
  page,
  wallet,
  world,
  chain,
  web,
}) => {
  const key = sshKey("ada");
  world.web.githubKeys = { ada: [key.line] };

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
  await page.getByPlaceholder("GitHub username").fill("ada");
  await page.getByRole("button", { name: "Fetch Keys" }).click();
  const signature = page.getByPlaceholder("Paste the raw base64 signature");
  await signature.fill(key.sign(wallet.publicKey(), "github:someone-else"));
  await page.getByRole("button", { name: "Verify Signature" }).click();
  await expect(page.getByTestId("sig-error")).toContainText(
    "Signature verification failed",
  );
  await signature.fill(key.sign(wallet.publicKey(), "github:ada"));
  await page.getByRole("button", { name: "Verify Signature" }).click();
  await expect(page.getByText("Git Identity Verified")).toBeVisible();

  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Welcome aboard!")).toBeVisible();
  expect(chain.sent).toEqual(["add_member"]);
  expect(chain.member(wallet.publicKey())).toMatchObject({
    meta: web.uploads[0],
    git_identity: "github:ada",
  });

  // The page reloads and the profile now reads the member from the chain.
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Continue" }).click(),
  ]);
  await page.getByRole("button", { name: "Open user profile" }).click();
  await expect(page.getByText("github:ada")).toBeVisible();
});
