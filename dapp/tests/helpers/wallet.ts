import type { BrowserContext, Page } from "@playwright/test";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { E2E_ENV } from "./env";

/**
 * GHOSTSIG, the one wallet the kit drives entirely over a documented popup
 * protocol (src/components/ghostsig.ts): the page at ghostsig.dev says
 * "ready", then answers each request. This copy of the page hands requests
 * to the test, which signs with its own key.
 */
const PAGE = `<!doctype html><title>GHOSTSIG</title><script>
  const reply = (message) =>
    window.opener.postMessage({ ghostsig: 1, ...message }, "*");
  addEventListener("message", async ({ data }) => {
    if (data?.ghostsig !== 1 || data.type !== "request") return;
    try {
      const result = await window.ghostsig(data.method, data.params);
      reply({ id: data.id, type: "result", result });
    } catch (error) {
      reply({ id: data.id, type: "error", error: { code: -4, message: String(error) } });
    }
  });
  reply({ type: "ready" });
</script>`;

export async function mockWallet(
  context: BrowserContext,
  keypair: Keypair,
): Promise<void> {
  const account = {
    address: keypair.publicKey(),
    publicKey: Buffer.from(keypair.rawPublicKey()).toString("hex"),
  };
  await context.exposeBinding(
    "ghostsig",
    (_source, method: string, params: { payload?: string }) => {
      if (method === "connect") return account;
      if (method !== "sign") throw new Error(`No ${method} in e2e tests`);
      const tx = TransactionBuilder.fromXdr(
        params.payload!,
        E2E_ENV.PUBLIC_SOROBAN_NETWORK_PASSPHRASE,
      );
      tx.sign(keypair);
      return {
        ...account,
        hash: Buffer.from(tx.hash()).toString("hex"),
        blob: tx.toEnvelope().toXdr("base64"),
        signature: Buffer.from(keypair.sign(tx.hash())).toString("base64"),
      };
    },
  );
  await context.route("https://ghostsig.dev/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PAGE }),
  );
}

/** Connect through the app's own button and the kit's wallet list. */
export async function connectWallet(page: Page): Promise<void> {
  await page.locator("[data-connect]").first().click();
  await page.getByText("GHOSTSIG", { exact: true }).click();
}
