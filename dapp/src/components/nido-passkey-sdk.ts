/**
 * The one export of @nidohq/passkey-sdk that @nidohq/stellar-wallets-kit-module
 * uses. The SDK's entry also loads its smart-account code and a second
 * stellar-sdk (v15), so astro.config.mjs aliases the package to this file.
 * If the module starts importing more, the build fails on the missing export.
 */
export function isContractId(subdomain: string): boolean {
  return subdomain.length === 56 && /^[cC]/i.test(subdomain);
}
