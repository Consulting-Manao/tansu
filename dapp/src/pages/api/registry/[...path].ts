import type { APIRoute } from "astro";
import {
  STELLAR_REGISTRY_API_BASES,
  type RegistryNetwork,
} from "@service/StellarRegistryService";

/**
 * Same-origin proxy for the Stellar Registry indexer API.
 *
 * The registry does not send CORS headers, so browsers cannot call it
 * directly. This endpoint forwards whitelisted registry paths upstream,
 * letting the client stay same-origin. Isolated from the rest of the app:
 * the client only knows /api/registry/** and the upstream base lives in
 * StellarRegistryService.
 */

export const prerender = false;

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Only registry contract lookups may be forwarded — no open proxy. */
const ALLOWED_PATH = /^contracts(\/[^/]+)?$/;

export const GET: APIRoute = async ({ params, url }) => {
  const path = params.path ?? "";

  if (!ALLOWED_PATH.test(path)) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: JSON_HEADERS,
    });
  }

  const network = (
    url.searchParams.get("network") === "testnet" ? "testnet" : "mainnet"
  ) as RegistryNetwork;

  try {
    const upstream = await fetch(
      `${STELLAR_REGISTRY_API_BASES[network]}/${path}`,
    );
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: JSON_HEADERS,
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Stellar Registry upstream unreachable" }),
      { status: 502, headers: JSON_HEADERS },
    );
  }
};
