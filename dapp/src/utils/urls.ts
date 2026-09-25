/**
 * URL utility functions
 */

/**
 * An account, contract or transaction on Stellar Expert, on this network. An
 * address is a contract when it is a C… one, like a smart account's.
 */
export function getStellarExpertUrl(
  identifier: string,
  type: "account" | "contract" | "transaction" = identifier.startsWith("C")
    ? "contract"
    : "account",
): string {
  const horizonUrl = import.meta.env.PUBLIC_HORIZON_URL;
  const network = horizonUrl.includes("testnet") ? "testnet" : "public";
  const path = type === "transaction" ? "tx" : type;
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
