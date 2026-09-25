import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./helpers/app";
import { read } from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

/** A 1×1 PNG. */
const PICTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("join with a picture and a git identity, then edit the profile", async ({
  page,
  wallet,
}) => {
  test.setTimeout(300_000);
  // An SSH key made by ssh-keygen, as a developer has one.
  const keyFile = join(mkdtempSync(join(tmpdir(), "tansu-e2e-")), "id_ed25519");
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyFile]);

  await page.goto("/");
  await connectWallet(page);
  await page.getByRole("button", { name: "Open user profile" }).click();
  await expect(page.getByText("Member Not Registered")).toBeVisible();
  await page.getByRole("button", { name: "Register Now" }).click();
  await page.getByPlaceholder("Enter your name").fill("Ada");
  await page
    .getByPlaceholder("Tell us about yourself...")
    .fill("Writes Soroban contracts.");
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: PICTURE });
  await expect(page.getByAltText("Profile preview")).toBeVisible();

  // The git handle is proven with an SSH signature over the member address.
  await page
    .getByRole("button", { name: "+ Link Git Handle (optional)" })
    .click();
  await page
    .getByRole("button", { name: "Link Git Handle", exact: true })
    .click();
  await page.getByText("Custom", { exact: true }).click();
  await page.getByLabel("Provider name").fill("codeberg");
  await page.getByLabel("Username").fill("ada");
  await page
    .getByLabel("SSH public key")
    .fill(readFileSync(`${keyFile}.pub`, "utf8"));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Its private key file").fill(keyFile);
  // The command the page prints signs, with the developer's own ssh-keygen.
  const command = await page.getByLabel("Signing command").textContent();
  const signature = execSync(command!, { shell: "/bin/bash" }).toString();
  const verify = page.getByRole("button", { name: "Verify Signature" });
  await page.getByLabel("Signature").fill(Buffer.alloc(64).toString("base64"));
  await verify.click();
  await expect(page.getByRole("alert")).toContainText(
    "Signature verification failed",
  );
  await page.getByLabel("Signature").fill(signature);
  await verify.click();
  await expect(page.getByText("Git key signature checked")).toBeVisible();

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
  // Codeberg does not list keys to check: the identity is self-declared.
  await expect(page.getByText("Self-declared")).toBeVisible();
  await expect(page.getByText("Writes Soroban contracts.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).stayed)).toBe(true);

  // A new name: the picture and the git identity stay. The picture moves
  // through the gateway, which takes a while to serve a new file.
  const joined = (await read.member(wallet.publicKey()))!.meta;
  await read.ipfs(joined, "/profile-image.png");
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await page.getByPlaceholder("Enter your name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Profile updated!")).toBeVisible({
    timeout: 120_000,
  });
  const member = (await read.member(wallet.publicKey()))!;
  expect(member.meta).not.toBe(joined);
  expect(member.git_identity).toBe("codeberg:ada");
  expect(await (await read.ipfs(member.meta, "/profile.json")).json()).toEqual({
    name: "Ada Lovelace",
    description: "Writes Soroban contracts.",
    social: "",
    image: "profile-image.png",
  });
  const picture = await read.ipfs(member.meta, "/profile-image.png");
  expect(Buffer.from(await picture.arrayBuffer())).toEqual(PICTURE);
});
