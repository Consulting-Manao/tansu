import { Badge } from "../packages/tansu/src/index.ts";
import { expect, test } from "./helpers/app";
import {
  castVote,
  createProposal,
  fundedKeypair,
  join,
  read,
  registerProject,
  setBadges,
  uniqueName,
} from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

test("propose, vote, remove a vote, revoke, veto and execute", async ({
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

  await page.goto("/");
  await connectWallet(page);

  // The maintainer approves it, with the weight of a Developer badge.
  await page.goto(`/proposal/?id=${soon}&name=${name}`);
  await page.getByRole("button", { name: "Vote", exact: true }).click();
  await page.getByText("Approve", { exact: true }).click();
  await page.getByRole("button", { name: "Vote", exact: true }).last().click();
  await expect(
    page.getByText("Your vote was submitted successfully."),
  ).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText("Weight: 10,000,000")).toBeVisible();
  await page
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Already Voted" }),
  ).toBeDisabled();

  // A new proposal, stored on IPFS; its proposer abstains by default.
  await page.goto(`/project/?name=${name}&tab=proposals`);
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
  await page.getByRole("button", { name: "Remove a vote" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Vote Removed")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText("No votes yet")).toBeVisible();
  await page.getByRole("button", { name: "Revoke proposal" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke proposal" })
    .click();
  await expect(page.getByText("Proposal Revoked")).toBeVisible({
    timeout: 120_000,
  });
  // Revoking deletes the proposal: its id is never reused.
  await expect(page.getByText("Proposal not found")).toBeVisible();
  expect(await read.proposal(name, created)).toHaveProperty("error");

  // A maintainer vetoes a proposal the vote approves: it stays on record,
  // rejected, with its reason.
  const unwanted = await createProposal(
    proposer,
    name,
    "Rename the project",
    90,
  );
  await castVote(wallet, name, unwanted, {
    tag: "PublicVote",
    values: [
      {
        address: wallet.publicKey(),
        weight: Badge.Developer,
        vote_choice: { tag: "Approve", values: undefined },
      },
    ],
  });
  await page.goto(`/proposal/?id=${unwanted}&name=${name}`);
  await page.getByRole("button", { name: "Veto proposal" }).click();
  const reason = "The name is part of a trademark claim.";
  await page.getByLabel("Reason").fill(reason);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Veto proposal" })
    .click();
  await expect(page.getByText("Proposal vetoed")).toBeVisible({
    timeout: 120_000,
  });
  // No vote, no tools: it is final.
  await expect(page.getByText("Vetoed", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Vetoed by /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Vote" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Veto proposal" })).toHaveCount(
    0,
  );
  expect((await read.proposal(name, unwanted))?.status.tag).toBe("Vetoed");
  const veto = await read.veto(name, unwanted);
  expect(veto.maintainer).toBe(wallet.publicKey());
  // The reason was uploaded once the veto landed, and the page links it.
  expect(await (await read.ipfs(veto.reason, "/reason.md")).text()).toBe(
    reason,
  );
  await expect(
    page.getByRole("link", { name: "Read the reason" }),
  ).toBeVisible();

  // Once its vote has ended, the first proposal is executed: approved.
  const endsAt = Number(
    (await read.proposal(name, soon))!.vote_data.voting_ends_at,
  );
  await expect
    .poll(() => Date.now() / 1000, { timeout: 180_000, intervals: [5_000] })
    .toBeGreaterThan(endsAt + 10);
  await page.goto(`/proposal/?id=${soon}&name=${name}`);
  await page.getByRole("button", { name: "Execute proposal" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Execute Transaction" }).click();
  await expect
    .poll(async () => (await read.proposal(name, soon))?.status.tag, {
      timeout: 120_000,
    })
    .toBe("Approved");
});
