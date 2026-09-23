import { expect, test } from "./helpers/app";
import { connectWallet } from "./helpers/wallet";

test("propose, vote, remove a vote, revoke a proposal and execute one", async ({
  page,
  chain,
  web,
  wallet,
}) => {
  const ok = page.getByRole("button", { name: "OK" });
  await page.goto("/");
  await connectWallet(page);

  // A new proposal, stored on IPFS.
  await page.goto("/governance/?name=demo");
  await page.getByRole("button", { name: "Submit Proposal" }).click();
  await page.getByPlaceholder("Write the name").fill("Fund a security audit");
  await page
    .getByPlaceholder("Input your proposal description here...")
    .fill(
      "We hire an independent auditor to review the Tansu contracts before the next release.",
    );
  for (const _ of ["outcomes", "duration", "review"]) {
    await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("button", { name: "Register Proposal" }).first().click();
  await expect(page.getByText("Your Proposal Is Live!")).toBeVisible();
  expect(chain.project("demo").proposals[2]).toMatchObject({
    title: "Fund a security audit",
    proposer: wallet.publicKey(),
    ipfs: web.uploads[0],
  });

  // Vote with the weight of a Developer badge, then remove that vote.
  await page.goto("/proposal/?id=0&name=demo");
  await page.getByRole("button", { name: "Vote", exact: true }).click();
  await page.getByText("Approve", { exact: true }).click();
  await page.getByRole("button", { name: "Vote", exact: true }).last().click();
  await ok.click();
  await expect(page.getByText("Weight: 10,000,000")).toBeVisible();
  await page
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Already Voted" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Remove Vote" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Vote Removed")).toBeVisible();
  await ok.click();
  await expect(page.getByText("No votes yet")).toBeVisible();

  // The maintainer revokes it as malicious.
  await page
    .getByRole("button", { name: "Mark as Malicious", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark as Malicious", exact: true })
    .last()
    .click();
  await expect(page.getByText("Proposal Revoked")).toBeVisible();
  await ok.click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();

  // The ended proposal is executed and approved.
  await page.goto("/proposal/?id=1&name=demo");
  await page.getByRole("button", { name: "Finalize Vote" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Execute Transaction" }).click();
  await expect
    .poll(() => chain.project("demo").proposals[1]!.status.tag)
    .toBe("Approved");

  expect(chain.sent).toEqual([
    "create_proposal",
    "vote",
    "remove_vote",
    "revoke_proposal",
    "execute",
  ]);
});
