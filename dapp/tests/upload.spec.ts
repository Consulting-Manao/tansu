import { expect, test } from "./helpers/app";
import { E2E_ENV } from "./helpers/env";
import { read } from "./helpers/testnet";
import { connectWallet } from "./helpers/wallet";

const WORKER = E2E_ENV.PUBLIC_DELEGATION_API_URL;
const CORS = { "access-control-allow-origin": "*" };

/** A 1×1 PNG. */
const PICTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** The join dialog, filled with a name and a picture: files to upload. */
async function openJoin(page: import("@playwright/test").Page) {
  await page.goto("/");
  await connectWallet(page);
  await page.getByRole("link", { name: "Open user profile" }).click();
  await page.getByRole("button", { name: "Join Tansu" }).click();
  await page.getByPlaceholder("Enter your name").fill("Grace");
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({ name: "g.png", mimeType: "image/png", buffer: PICTURE });
  await expect(page.getByAltText("Profile preview")).toBeVisible();
}

test("nothing is signed or sent when the upload service is down", async ({
  page,
  wallet,
}) => {
  await page.route(`${WORKER}/health`, (route) =>
    route.fulfill({
      status: 503,
      headers: CORS,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    }),
  );
  await openJoin(page);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  await expect(page.getByRole("dialog")).toContainText(
    "Nothing was signed or sent",
  );
  // A member that was never added reads as an error.
  expect(await read.member(wallet.publicKey())).toHaveProperty("error");
});

test("an upload that fails after the transaction landed can be tried again", async ({
  page,
  wallet,
}) => {
  test.setTimeout(300_000);
  let failing = true;
  await page.route(`${WORKER}/`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
        },
      });
    }
    if (request.method() === "POST" && failing) {
      return route.fulfill({
        status: 502,
        headers: CORS,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Filebase HTTP 502" }),
      });
    }
    return route.continue();
  });
  await openJoin(page);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  // Five tries, 1 to 8 s apart, then the error says the call is recorded.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("is on-chain, but its files", {
    timeout: 120_000,
  });
  await expect(dialog).toContainText("Filebase HTTP 502");
  expect(await read.member(wallet.publicKey())).toBeTruthy();

  // The service is back: the same files go up, and the flow ends.
  failing = false;
  await dialog.getByRole("button", { name: "Try the upload again" }).click();
  await expect(page.getByText("Welcome aboard!")).toBeVisible({
    timeout: 120_000,
  });
  const meta = (await read.member(wallet.publicKey()))!.meta;
  await read.ipfs(meta, "/profile-image.png");
});
