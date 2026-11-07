import { Keypair } from "@stellar/stellar-sdk";
import { expect, test } from "./helpers/app";
import {
  fundedKeypair,
  read,
  registerProject,
  uniqueName,
} from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

test("support a project: a donation to its first maintainer, with a message that fits its memo", async ({
  page,
  wallet,
}) => {
  test.setTimeout(240_000);
  const name = uniqueName("gift");
  const [maintainer, other] = await Promise.all([
    fundedKeypair(),
    fundedKeypair(),
  ]);
  await registerProject(name, [maintainer, other]);

  await page.goto("/");
  await connectWallet(page);
  await page.goto(`/project/?name=${name}`);
  await page.getByRole("button", { name: "Support the project" }).click();
  const dialog = page.getByRole("dialog", { name: `Support ${name}` });
  await expect(dialog.getByText(maintainer.publicKey())).toBeVisible();
  const donate = dialog.getByRole("button", { name: "Donate" });
  await dialog.getByLabel("Amount").fill("2.5");

  // A text memo holds 28 bytes: a longer message is refused before signing.
  const message = dialog.getByLabel("Message (optional)");
  await message.fill("Thank you for building Tansu, really!");
  await expect(dialog.getByText("A message holds 28 bytes")).toBeVisible();
  await expect(donate).toBeDisabled();
  await message.fill("Thank you for Tansu!");
  await expect(dialog.getByText("20/28 bytes")).toBeVisible();

  await donate.click();
  await expect(page.getByText("Thank you!")).toBeVisible({ timeout: 120_000 });
  expect(await read.lastPayment(wallet.publicKey())).toMatchObject({
    from: wallet.publicKey(),
    to: maintainer.publicKey(),
    amount: "2.5000000",
    transaction: { memo: "Thank you for Tansu!" },
  });
});

// A wallet friendbot never funded.
const unfunded = test.extend({
  wallet: async ({}, use) => use(Keypair.random()),
});

unfunded(
  "an unfunded wallet is offered funding over the form being filled",
  async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.getByPlaceholder("Enter your name").fill("Grace");
    // Linking a git handle connects the wallet first.
    await page
      .getByRole("button", { name: "+ Link Git Handle (optional)" })
      .click();
    await page.getByText("GHOSTSIG", { exact: true }).click();
    await expect(page.getByText("Wallet not funded")).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    // The form is still there, as it was.
    await expect(page.getByPlaceholder("Enter your name")).toHaveValue("Grace");
    await expect(page.getByText("Link Git Identity")).toBeVisible();
  },
);
