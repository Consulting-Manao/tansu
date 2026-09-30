import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import type { Keypair } from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
import { fundedKeypair } from "./testnet";
import { mockWallet } from "./wallet";

type Fixtures = {
  /** Start with the Terms of Service already accepted. */
  acceptTerms: boolean;
  /** The account the GHOSTSIG wallet signs with, funded on testnet. */
  wallet: Keypair;
};

/** The version of the Terms: the date they state at their top. */
const { lastUpdated } = JSON.parse(
  readFileSync(
    new URL("../../src/constants/terms-summary.json", import.meta.url),
    "utf8",
  ),
);

/** Pages of `target` start with the current Terms accepted. */
export const acceptTermsIn = (target: Page | BrowserContext) =>
  target.addInitScript(
    (version: string) =>
      localStorage.setItem("tansu_tos_accepted", JSON.stringify({ version })),
    lastUpdated,
  );

/**
 * Every test runs the production build against testnet, with a GHOSTSIG
 * wallet that signs with `wallet`, and fails on any uncaught page error.
 */
export const test = base.extend<Fixtures>({
  acceptTerms: [true, { option: true }],
  wallet: async ({}, use) => use(await fundedKeypair()),
  page: async ({ page, wallet, acceptTerms }, use) => {
    await mockWallet(page.context(), wallet);
    if (acceptTerms) await acceptTermsIn(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors).toEqual([]);
  },
});

export { expect };
