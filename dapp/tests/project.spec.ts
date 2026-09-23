import { GRACE, expect, test } from "./helpers/app";
import { connectWallet } from "./helpers/wallet";

test("register a project, update a config and give a badge", async ({
  page,
  chain,
  web,
}) => {
  await page.goto("/");
  await connectWallet(page);

  // Register "orbit", hosted on Radicle. "demo" is already taken.
  await page.getByRole("button", { name: "+ Add Project" }).click();
  const wizard = page.locator(".project-modal-container");
  const name = page.getByPlaceholder(
    "Write the project name (e.g., myproject)",
  );
  await name.fill("demo");
  await page.getByPlaceholder("My Awesome Project").fill("Orbit Toolkit");
  await page
    .getByPlaceholder("https://github.com/owner/repo")
    .fill("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5");
  await wizard.getByRole("button", { name: "Next" }).click();
  await expect(
    wizard.getByText("Project name already registered"),
  ).toBeVisible();
  await expect(wizard.getByRole("combobox")).toHaveValue("radicle");
  await name.fill("orbit");
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

  await expect(page).toHaveURL(/\/project\/?\?name=orbit/);
  expect(chain.sent).toEqual(["register"]);
  expect(chain.project("orbit").project).toMatchObject({
    config: { url: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5", ipfs: web.uploads[0] },
  });

  // Update the configuration of "demo".
  await page.goto("/project/?name=demo");
  await page.getByRole("heading", { name: "Pony Factor" }).waitFor();
  await page.getByRole("button", { name: "Update config" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("My Awesome Project").fill("Demo Project");
  await page.getByRole("button", { name: "Next" }).click();
  await page
    .getByRole("button", { name: "Update Config", exact: true })
    .click();
  await expect.poll(() => chain.sent).toEqual(["register", "update_config"]);
  expect(chain.project("demo").project.config.ipfs).toBe(web.uploads[1]);

  // Grace, a member, becomes part of the community.
  await page.goto("/project/?name=demo");
  await page.getByRole("heading", { name: "Pony Factor" }).waitFor();
  await page.getByRole("button", { name: "Add badge" }).click();
  await page.getByPlaceholder("Member address as G...").fill(GRACE);
  await page.getByRole("checkbox", { name: "Community" }).check();
  await page.getByRole("button", { name: "Add Badges" }).click();
  await expect
    .poll(() => chain.sent)
    .toEqual(["register", "update_config", "set_badges"]);
  expect(chain.project("demo").badges.community).toEqual([GRACE]);
});
