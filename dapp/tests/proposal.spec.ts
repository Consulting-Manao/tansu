import { Asset } from "@stellar/stellar-sdk";
import { Badge } from "../packages/tansu/src/index.ts";
import { expect, test } from "./helpers/app";
import { E2E_ENV } from "./helpers/env";
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

const XLM = Asset.native().contractId(
  E2E_ENV.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
);

test("outcome calls land in their slots, typed, and execute", async ({
  page,
  wallet,
}) => {
  test.setTimeout(600_000);
  const name = uniqueName("calls");
  const proposer = await fundedKeypair();
  await registerProject(name, [wallet], {
    minVotingPeriod: 30,
    executeDelay: 1,
  });
  await Promise.all([join(wallet, "Maintainer"), join(proposer, "Proposer")]);
  await setBadges(wallet, name, wallet.publicKey(), [Badge.Developer]);

  await page.goto("/");
  await connectWallet(page);
  await page.goto(`/governance/?name=${name}`);
  await page.getByRole("button", { name: "Submit Proposal" }).click();
  await page.getByPlaceholder("Write the name").fill("Pay the auditor");
  await page
    .getByPlaceholder("Input your proposal description here...")
    .fill(
      "Pay the independent auditor once the review of the contracts is published.",
    );
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // An outcome calls a function with typed arguments, read from its spec.
  const addCall = async (outcome: string, fn: string, arg?: string) => {
    await page
      .getByRole("button", { name: `+ Add ${outcome} Outcome` })
      .click();
    const section = page.getByRole("region", { name: `${outcome} Outcome` });
    await section
      .getByPlaceholder("Write the description")
      .fill(`${outcome}: call ${fn}.`);
    await section.getByLabel("Contract Address").fill(XLM);
    await section.getByLabel("Function Name").selectOption(fn);
    if (arg) await section.getByLabel(/^id \(address\)/).fill(arg);
  };
  await addCall("Approved", "balance", proposer.publicKey());
  // A removed outcome is not submitted, even with a call filled in.
  await addCall("Rejected", "decimals");
  await page
    .getByRole("region", { name: "Rejected Outcome" })
    .getByRole("button", { name: "Remove" })
    .click();
  await addCall("Cancelled", "balance", wallet.publicKey());
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Rejected Outcome")).toHaveCount(0);
  await page.getByRole("button", { name: "Register Proposal" }).first().click();
  await expect(page.getByText("Your Proposal Is Live!")).toBeVisible({
    timeout: 120_000,
  });

  // On-chain: calls at their outcome's position, the gap filled with a call
  // that changes nothing, and addresses typed as addresses.
  const calls = await read.outcomeCalls(name, 0);
  expect(
    calls.map(({ address, execute_fn, args }: any) => [
      address,
      execute_fn,
      args.map((arg: any) => arg.type),
    ]),
  ).toEqual([
    [XLM, "balance", ["scvAddress"]],
    [XLM, "decimals", []],
    [XLM, "balance", ["scvAddress"]],
  ]);

  // The same calls execute: approving runs the typed call; a proposal whose
  // approved slot is the filler executes too.
  const typed = await createProposal(proposer, name, "Typed call", 60, {
    outcomeContracts: calls,
  });
  const filler = await createProposal(proposer, name, "Filler call", 60, {
    outcomeContracts: [calls[1], calls[1], calls[2]],
  });
  for (const id of [typed, filler]) {
    await page.goto(`/proposal/?id=${id}&name=${name}`);
    await page.getByRole("button", { name: "Vote", exact: true }).click();
    await page.getByText("Approve", { exact: true }).click();
    await page
      .getByRole("button", { name: "Vote", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "OK" }).click({ timeout: 120_000 });
  }
  const endsAt = Number(
    (await read.proposal(name, filler))!.vote_data.voting_ends_at,
  );
  await expect
    .poll(() => Date.now() / 1000, { timeout: 180_000, intervals: [5_000] })
    .toBeGreaterThan(endsAt + 10);
  for (const id of [typed, filler]) {
    await page.goto(`/proposal/?id=${id}&name=${name}`);
    await page.getByRole("button", { name: "Finalize Vote" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Execute Transaction" }).click();
    await expect
      .poll(async () => (await read.proposal(name, id))?.status.tag, {
        timeout: 120_000,
      })
      .toBe("Approved");
  }
});
