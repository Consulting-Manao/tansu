import { Buffer } from "node:buffer";
import { parse } from "smol-toml";
import { Badge } from "../packages/tansu/src/index.ts";
import { deriveProjectKey, projectKeyHex } from "../src/utils/projectKey.ts";
import { expect, test } from "./helpers/app";
import {
  RADICLE_REPO,
  fundedKeypair,
  join,
  read,
  registerProject,
  setBadges,
  setSubProjects,
  uniqueName,
  updateConfig,
} from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

test("register a project, then update its config, badges and sub-projects", async ({
  page,
  wallet,
}) => {
  test.setTimeout(480_000);
  const taken = uniqueName("taken");
  const orbit = uniqueName("orbit");
  const [grace, second] = await Promise.all([fundedKeypair(), fundedKeypair()]);
  // Values the form does not manage: every update keeps them.
  const extra = {
    CURRENCIES: [{ code: "DEMO", issuer: wallet.publicKey() }],
    DOCUMENTATION: { ORG_KEYWORDS: ["git", "dao"] },
  };
  await Promise.all([
    registerProject(taken, [wallet, second], {}, extra),
    join(grace, "Grace"),
  ]);
  await setBadges(wallet, taken, grace.publicKey(), [Badge.Developer]);

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

  // Update the configuration of the first project, from its files.
  const ok = page.getByRole("button", { name: "OK" });
  const dialog = page.getByRole("dialog");
  const editFullName = async (fullName: string) => {
    await page.getByRole("button", { name: "Update config" }).click();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByPlaceholder("My Awesome Project").fill(fullName);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
  };
  await page.goto(`/project/?name=${taken}`);
  await editFullName("Stale Project");
  // Another maintainer changes the project meanwhile: nothing is overwritten.
  await updateConfig(second, taken, [wallet, second], {
    toml: extra,
    fullName: "Their Project",
  });
  const theirs = (await read.project(taken))!.config.ipfs;
  await page
    .getByRole("button", { name: "Update Config", exact: true })
    .click();
  await expect(
    page.getByText(/Another maintainer updated this project meanwhile/),
  ).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect((await read.project(taken))!.config.ipfs).toBe(theirs);

  await editFullName("Demo Project");
  await page
    .getByRole("button", { name: "Update Config", exact: true })
    .click();
  await expect
    .poll(async () => (await read.project(taken))!.config.ipfs, {
      timeout: 120_000,
    })
    .not.toBe(theirs);
  // The page shows the new configuration at once.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Demo Project", { exact: true })).toBeVisible();
  const toml: any = parse(
    await (
      await read.ipfs((await read.project(taken))!.config.ipfs, "/tansu.toml")
    ).text(),
  );
  expect(toml).toMatchObject({
    ...extra,
    ACCOUNTS: [wallet.publicKey(), second.publicKey()],
    PRINCIPALS: [{ radicle: "maintainer0" }, { radicle: "maintainer1" }],
    DOCUMENTATION: { ...extra.DOCUMENTATION, ORG_DBA: "Demo Project" },
  });

  // Grace, a developer, also joins the community: her badge stays.
  await page.getByRole("button", { name: "Add badge" }).click();
  await page.getByLabel("Member address").fill(grace.publicKey());
  await expect(page.getByRole("checkbox", { name: "Developer" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Community" }).check();
  await page.getByRole("button", { name: "Save badges" }).click();
  await expect
    .poll(async () => (await read.badges(taken)).community, {
      timeout: 120_000,
    })
    .toEqual([grace.publicKey()]);
  expect((await read.badges(taken)).developer).toEqual([grace.publicKey()]);
  await ok.click();

  // The project groups others: one that cannot be read stays, and a name
  // that is no project is refused.
  const gone = deriveProjectKey(uniqueName("gone"));
  await setSubProjects(wallet, taken, [gone]);
  await page.getByRole("button", { name: "Sub-Projects" }).click();
  await expect(dialog.getByText(/^Unknown project \(/)).toBeVisible();
  const subProject = page.getByLabel("Project name");
  await subProject.fill(uniqueName("nope"));
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/No project is named/)).toBeVisible();
  await subProject.fill(orbit);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText(orbit, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect
    .poll(
      async () =>
        (await read.project(taken))!.sub_projects?.map((key) =>
          Buffer.from(key).toString("hex"),
        ),
      { timeout: 120_000 },
    )
    .toEqual([gone.toString("hex"), projectKeyHex(orbit)]);
});
