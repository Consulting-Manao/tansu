import { readFile } from "node:fs/promises";
import { Badge } from "../packages/tansu/src/index.ts";
import { encryptWithPublicKey } from "../src/utils/crypto";
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

test("anonymous voting: the key file is saved, ballots are checked, an invalid one is removed", async ({
  page,
  wallet,
}) => {
  test.setTimeout(600_000);
  const name = uniqueName("anon");
  const [proposer, rogue] = await Promise.all([
    fundedKeypair(),
    fundedKeypair(),
  ]);
  await registerProject(name, [wallet], {
    minVotingPeriod: 30,
    executeDelay: 1,
  });
  await Promise.all([
    join(wallet, "Maintainer"),
    join(proposer, "Proposer"),
    join(rogue, "Rogue"),
  ]);
  await setBadges(wallet, name, wallet.publicKey(), [Badge.Developer]);

  const ok = page.getByRole("button", { name: "OK" });
  const next = page.getByRole("button", { name: "Next", exact: true });
  await page.goto("/");
  await connectWallet(page);

  // The first anonymous proposal sets up the project's key: the author must
  // save the key file and select it back before anything is signed.
  await page.goto(`/governance/?name=${name}`);
  await page.getByRole("button", { name: "Submit Proposal" }).click();
  await page
    .getByPlaceholder("Write the name")
    .fill("Elect the release manager");
  await page
    .getByPlaceholder("Input your proposal description here...")
    .fill(
      "Members elect the release manager for the next cycle in a secret ballot.",
    );
  await page.getByLabel("Enable anonymous voting").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download key file" }).click();
  const keyFile = await (await download).path();
  await next.click();
  // The refusal, not the panel's own advice.
  await expect(page.getByText("Download the anonymous key file")).toBeVisible();
  await ok.click();
  await page.getByLabel("Select the saved key file").setInputFiles(keyFile);
  await expect(page.getByText("Key file saved.")).toBeVisible();
  for (const _ of ["outcomes", "duration", "review"]) await next.click();
  await page.getByRole("button", { name: "Register Proposal" }).first().click();
  await page.getByRole("button", { name: "Sign setup" }).click();
  await expect(page.getByText("Your Proposal Is Live!")).toBeVisible({
    timeout: 180_000,
  });
  const { publicKey } = JSON.parse(await readFile(keyFile, "utf8"));
  expect((await read.anonymousConfig(name)).public_key).toBe(publicKey);

  // The key is read fresh: the next author is not offered a new one.
  await page.goto(`/governance/?name=${name}`);
  await page.getByRole("button", { name: "Submit Proposal" }).click();
  await page.getByLabel("Enable anonymous voting").check();
  await expect(page.getByText("Already configured.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download key file" }),
  ).toHaveCount(0);

  // An anonymous proposal that ends within the test.
  const id = await createProposal(proposer, name, "Adopt the new logo", 60, {
    publicVoting: false,
  });

  // The maintainer approves in secret and gets a receipt of the commitments.
  await page.goto(`/proposal/?id=${id}&name=${name}`);
  await expect(page.getByText("Anonymous voting")).toBeVisible();
  await page.getByRole("button", { name: "Vote", exact: true }).click();
  await page.getByText("Approve", { exact: true }).click();
  await page.getByRole("button", { name: "Vote", exact: true }).last().click();
  await ok.click({ timeout: 120_000 });
  await expect(page.getByText("Vote Receipt")).toBeVisible();
  await expect(page.getByText(/^[0-9a-f]{192}$/)).toHaveCount(3);

  // A ballot sent straight to the contract that counts twice for approve. Its
  // commitments match its values, so only the tally can tell.
  const config = await read.anonymousConfig(name);
  const prefix = `${rogue.publicKey()}:${name}:${id}`;
  const encrypt = (values: bigint[]) =>
    Promise.all(
      values.map((v) =>
        encryptWithPublicKey(`${prefix}:${v}`, config.public_key),
      ),
    );
  const votes = [2n, 0n, 0n];
  const seeds = [11n, 22n, 33n];
  await castVote(rogue, name, id, {
    tag: "AnonymousVote",
    values: [
      {
        address: rogue.publicKey(),
        weight: 1,
        encrypted_votes: await encrypt(votes),
        encrypted_seeds: await encrypt(seeds),
        commitments: await read.commitments(name, votes, seeds),
      },
    ],
  });

  const endsAt = Number(
    (await read.proposal(name, id))!.vote_data.voting_ends_at,
  );
  await expect
    .poll(() => Date.now() / 1000, { timeout: 180_000, intervals: [5_000] })
    .toBeGreaterThan(endsAt + 10);

  // Revealing the votes flags the ballot; execution waits for its removal.
  await page.goto(`/proposal/?id=${id}&name=${name}`);
  await page.getByRole("button", { name: "Finalize Vote" }).click();
  await page.getByLabel("Choose key file").setInputFiles(keyFile);
  const invalid = page
    .getByRole("alert")
    .filter({ hasText: "These ballots cannot count" });
  await expect(invalid).toContainText(rogue.publicKey());
  await expect(invalid).toContainText("It does not choose exactly one option.");
  await expect(next).toBeDisabled();
  await invalid.getByRole("button", { name: "Remove" }).click();
  await expect(invalid).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByLabel("proof-ok")).toBeVisible();
  await next.click();
  await page.getByRole("button", { name: "Execute Transaction" }).click();
  await expect
    .poll(async () => (await read.proposal(name, id))?.status.tag, {
      timeout: 120_000,
    })
    .toBe("Approved");
});
