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

/** The project page's tabs; the first is the page without `?tab=`. */
const PROJECT_TABS = ["overview", "code", "proposals", "people"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

/** The tab the project page shows: `?tab=` in its address. */
export function projectTabFromUrl(): ProjectTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return PROJECT_TABS.find((known) => known === tab) ?? "overview";
}

export function projectUrl(name: string, tab: ProjectTab = "overview"): string {
  const query = tab === "overview" ? "" : `&tab=${tab}`;
  return `/project/?name=${encodeURIComponent(name)}${query}`;
}

/** The member the page is about: `?address=` in its address. */
export function memberAddressFromUrl(): string {
  return new URLSearchParams(window.location.search).get("address") ?? "";
}

export function memberUrl(address: string): string {
  return `/member/?address=${encodeURIComponent(address)}`;
}

/** The proposal the page is about: `?id=` in its address, or NaN. */
export function proposalIdFromUrl(): number {
  const id = new URLSearchParams(window.location.search).get("id");
  return id === null || id === "" ? NaN : Number(id);
}

export function proposalUrl(name: string, id: number | string): string {
  return `/proposal/?id=${id}&name=${encodeURIComponent(name)}`;
}
