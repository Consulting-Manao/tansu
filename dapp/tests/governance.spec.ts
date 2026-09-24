import { Badge } from "../packages/tansu/src/index.ts";
import { expect, test } from "./helpers/app";
import {
  createProposal,
  fundedKeypair,
  join,
  read,
  registerProject,
  setBadges,
  uniqueName,
} from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

test("propose, vote, remove a vote, revoke a proposal and execute one", async ({
  page,
  wallet,
}) => {
  test.setTimeout(480_000);
  const name = uniqueName("gov");
  const proposer = await fundedKeypair();
  // Short periods: a proposal can end and be executed within the test.
  await registerProject(name, [wallet], {
    minVotingPeriod: 30,
    executeDelay: 1,
  });
  await Promise.all([join(wallet, "Maintainer"), join(proposer, "Proposer")]);
  await setBadges(wallet, name, wallet.publicKey(), [Badge.Developer]);
  const soon = await createProposal(proposer, name, "Ship the dark theme", 90);

  const ok = page.getByRole("button", { name: "OK" });
  await page.goto("/");
  await connectWallet(page);

  // The maintainer approves it, with the weight of a Developer badge.
  await page.goto(`/proposal/?id=${soon}&name=${name}`);
  await page.getByRole("button", { name: "Vote", exact: true }).click();
  await page.getByText("Approve", { exact: true }).click();
  await page.getByRole("button", { name: "Vote", exact: true }).last().click();
  await ok.click({ timeout: 120_000 });
  await expect(page.getByText("Weight: 10,000,000")).toBeVisible();
  await page
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Already Voted" }),
  ).toBeDisabled();

  // A new proposal, stored on IPFS; its proposer abstains by default.
  await page.goto(`/governance/?name=${name}`);
  await page.getByRole("button", { name: "Submit Proposal" }).click();
  await page.getByPlaceholder("Write the name").fill("Fund a security audit");
  await page
    .getByPlaceholder("Input your proposal description here...")
    .fill(
      "We hire an independent auditor to review the Tansu contracts before the next release.",
    );
  for (const _ of ["outcomes", "duration", "review"]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Register Proposal" }).first().click();
  await expect(page.getByText("Your Proposal Is Live!")).toBeVisible({
    timeout: 120_000,
  });
  const created = soon + 1;
  expect(await read.proposal(name, created)).toMatchObject({
    title: "Fund a security audit",
    proposer: wallet.publicKey(),
  });

  // The maintainer removes that vote, then revokes the proposal.
  await page.goto(`/proposal/?id=${created}&name=${name}`);
  await page.getByRole("button", { name: "Remove Vote" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Vote Removed")).toBeVisible({
    timeout: 120_000,
  });
  await ok.click();
  await expect(page.getByText("No votes yet")).toBeVisible();
  await page
    .getByRole("button", { name: "Mark as Malicious", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark as Malicious", exact: true })
    .last()
    .click();
  await expect(page.getByText("Proposal Revoked")).toBeVisible({
    timeout: 120_000,
  });
  await ok.click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  expect((await read.proposal(name, created))?.status.tag).toBe("Malicious");

  // Once its vote has ended, the first proposal is executed: approved.
  const endsAt = Number(
    (await read.proposal(name, soon))!.vote_data.voting_ends_at,
  );
  await expect
    .poll(() => Date.now() / 1000, { timeout: 180_000, intervals: [5_000] })
    .toBeGreaterThan(endsAt + 10);
  await page.goto(`/proposal/?id=${soon}&name=${name}`);
  await page.getByRole("button", { name: "Finalize Vote" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Execute Transaction" }).click();
  await expect
    .poll(async () => (await read.proposal(name, soon))?.status.tag, {
      timeout: 120_000,
    })
    .toBe("Approved");
});
