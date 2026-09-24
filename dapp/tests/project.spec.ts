import { Badge } from "../packages/tansu/src/index.ts";
import { expect, test } from "./helpers/app";
import {
  RADICLE_REPO,
  fundedKeypair,
  join,
  read,
  registerProject,
  uniqueName,
} from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

test("register a project, update a config and give a badge", async ({
  page,
  wallet,
}) => {
  test.setTimeout(360_000);
  const taken = uniqueName("taken");
  const orbit = uniqueName("orbit");
  const grace = await fundedKeypair();
  await Promise.all([registerProject(taken, [wallet]), join(grace, "Grace")]);

  await page.goto("/");
  await connectWallet(page);

  // Register a project hosted on Radicle; the first name is already taken.
  await page.getByRole("button", { name: "+ Add Project" }).click();
  const wizard = page.getByRole("dialog");
  const name = page.getByPlaceholder(
    "Write the project name (e.g., myproject)",
  );
  await name.fill(taken);
  await page.getByPlaceholder("My Awesome Project").fill("Orbit Toolkit");
  await page
    .getByPlaceholder("https://github.com/owner/repo")
    .fill(RADICLE_REPO);
  await wizard.getByRole("button", { name: "Next" }).click();
  await expect(
    wizard.getByText("Project name already registered"),
  ).toBeVisible();
  await expect(wizard.getByRole("combobox")).toHaveValue("radicle");
  await name.fill(orbit);
  await wizard.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("alias").fill("ada");
  await wizard.getByRole("button", { name: "Next" }).click();
  await page
    .getByPlaceholder("Your organisation / project owner name")
    .fill("Orbit Labs");
  await page
    .getByPlaceholder("Describe your project (min 3 words)")
    .fill("Tools for orbital mechanics");
  await wizard.getByRole("button", { name: "Next" }).click();
  await wizard.getByRole("button", { name: "Register Project" }).click();
  await expect(page).toHaveURL(new RegExp(`/project/?\\?name=${orbit}`), {
    timeout: 120_000,
  });
  expect(await read.project(orbit)).toMatchObject({
    maintainers: [wallet.publicKey()],
    config: { url: RADICLE_REPO },
  });

  // Update the configuration of the first project.
  const before = (await read.project(taken))!.config.ipfs;
  await page.goto(`/project/?name=${taken}`);
  // A maintainer edits what the page shows, once its tansu.toml is read.
  await expect(page.getByText("E2E Labs").first()).toBeVisible();
  await page.getByRole("button", { name: "Update config" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByPlaceholder("My Awesome Project").fill("Demo Project");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Update Config", exact: true })
    .click();
  await expect
    .poll(async () => (await read.project(taken))!.config.ipfs, {
      timeout: 120_000,
    })
    .not.toBe(before);
  // The page shows the new configuration at once.
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Demo Project", { exact: true })).toBeVisible();

  // Grace, a member, becomes part of the community.
  await page.getByRole("button", { name: "Add badge" }).click();
  await page.getByPlaceholder("Member address as G...").fill(grace.publicKey());
  await page.getByRole("checkbox", { name: "Community" }).check();
  await page.getByRole("button", { name: "Add Badges" }).click();
  await expect
    .poll(async () => (await read.badges(taken)).community, {
      timeout: 120_000,
    })
    .toEqual([grace.publicKey()]);
  expect((await read.member(grace.publicKey()))?.projects).toEqual([
    expect.objectContaining({ badges: [Badge.Community] }),
  ]);
  await expect(
    page.getByText(`${grace.publicKey().slice(0, 20)}...`),
  ).toBeVisible();
});
