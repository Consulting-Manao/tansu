/**
 * URL utility functions
 */

/**
 * Get the Stellar Explorer URL for an address or transaction
 * @param identifier - The address or transaction hash
 * @param type - The type of identifier ('account' or 'transaction')
 * @returns The Stellar Expert URL
 */
export function getStellarExpertUrl(
  identifier: string,
  type: "account" | "transaction" = "account",
): string {
  const horizonUrl = import.meta.env.PUBLIC_HORIZON_URL;
  const network = horizonUrl.includes("testnet") ? "testnet" : "public";
  const path = type === "transaction" ? "tx" : "account";
  return `https://stellar.expert/explorer/${network}/${path}/${identifier}`;
}

// A project's pages are static and read their query string in the browser.
// The trailing slash is the URL Netlify serves without a redirect, and the one
// the service worker's precache matches.

/** The project the page is about: `?name=` in its address. */
export function projectNameFromUrl(): string {
  return new URLSearchParams(window.location.search).get("name") ?? "";
}

export function projectUrl(name: string): string {
  return `/project/?name=${encodeURIComponent(name)}`;
}

export function governanceUrl(name: string): string {
  return `/governance/?name=${encodeURIComponent(name)}`;
}

export function proposalUrl(name: string, id: number | string): string {
  return `/proposal/?id=${id}&name=${encodeURIComponent(name)}`;
}
