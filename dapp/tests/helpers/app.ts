import { test as base, expect } from "@playwright/test";
import type { Keypair } from "@stellar/stellar-sdk";
import { fundedKeypair } from "./testnet";
import { mockWallet } from "./wallet";

type Fixtures = {
  /** Start with the Terms of Service already accepted. */
  acceptTerms: boolean;
  /** The account the GHOSTSIG wallet signs with, funded on testnet. */
  wallet: Keypair;
};

/**
 * Every test runs the production build against testnet, with a GHOSTSIG
 * wallet that signs with `wallet`, and fails on any uncaught page error.
 */
export const test = base.extend<Fixtures>({
  acceptTerms: [true, { option: true }],
  wallet: async ({}, use) => use(await fundedKeypair()),
  page: async ({ page, wallet, acceptTerms }, use) => {
    await mockWallet(page.context(), wallet);
    if (acceptTerms) {
      await page.addInitScript(() =>
        localStorage.setItem("tansu_tos_accepted", "true"),
      );
    }
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors).toEqual([]);
  },
});

export { expect };
