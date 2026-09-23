import type { BrowserContext, Route } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./env";

/** Filebase's answer for a CID no node provides. */
const NO_PROVIDERS =
  "Unable to retrieve content within timeout period: no providers found for the CID (phase: provider discovery)";

export interface GithubRepo {
  commits: { sha: string; message: string; author: string; date: string }[];
  readme?: string;
}

export interface WebContent {
  /** IPFS files by `<cid>/<path>`. */
  ipfs: Record<string, string>;
  /** CIDs Filebase answers with 504 "no providers". */
  deadCids?: string[];
  /** GitHub repositories by `owner/repo`. */
  github?: Record<string, GithubRepo>;
  /** Ed25519 SSH public keys of GitHub users. */
  githubKeys?: Record<string, string[]>;
}

const IPFS_GATEWAY = "ipfs.filebase.io";
const APP = `localhost:${E2E_PORT}`;

/**
 * Everything the app fetches besides the chain: the IPFS gateway, Horizon,
 * the upload worker and GitHub. Requests to any other host are aborted, so
 * nothing reaches the real network.
 */
export class FakeWeb {
  /** Gateway URLs requested, as `<cid><path>`. */
  readonly ipfsRequests: string[] = [];
  /** CIDs uploaded through the delegation worker. */
  readonly uploads: string[] = [];
  /** Aborted requests, for debugging a failing test. */
  readonly blocked: string[] = [];

  constructor(private readonly content: WebContent) {}

  async route(context: BrowserContext): Promise<void> {
    const handled = new Map<string, (route: Route, url: URL) => unknown>([
      [IPFS_GATEWAY, (route, url) => this.ipfs(route, url)],
      [
        host(E2E_ENV.PUBLIC_HORIZON_URL),
        (route, url) => this.horizon(route, url),
      ],
      [host(E2E_ENV.PUBLIC_DELEGATION_API_URL), (route) => this.upload(route)],
      ["api.github.com", (route, url) => this.github(route, url)],
    ]);
    const ownHosts = [
      APP,
      host(E2E_ENV.PUBLIC_SOROBAN_RPC_URL),
      "ghostsig.dev",
    ];
    await context.route(
      (url) => !ownHosts.includes(url.host),
      (route) => {
        const url = new URL(route.request().url());
        const handler = handled.get(url.host);
        if (handler) return handler(route, url);
        this.blocked.push(url.href);
        return route.abort("blockedbyclient");
      },
    );
  }

  private ipfs(route: Route, url: URL) {
    const [, , cid, ...rest] = url.pathname.split("/");
    const path = `/${rest.join("/")}`;
    this.ipfsRequests.push(`${cid}${path}`);
    if (this.content.deadCids?.includes(cid!)) {
      return route.fulfill({ status: 504, body: NO_PROVIDERS, headers: cors });
    }
    const body = this.content.ipfs[`${cid}${path}`];
    if (body === undefined)
      return route.fulfill({ status: 404, headers: cors });
    return route.fulfill({ body, headers: cors });
  }

  private horizon(route: Route, url: URL) {
    const [, , account, operations] = url.pathname.split("/");
    if (operations === "operations") {
      return route.fulfill({
        json: { _embedded: { records: [] } },
        headers: cors,
      });
    }
    return route.fulfill({
      json: {
        id: account,
        account_id: account,
        sequence: "1",
        subentry_count: 0,
        balances: [{ asset_type: "native", balance: "1000.0000000" }],
      },
      headers: cors,
    });
  }

  private upload(route: Route) {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    const { cid } = route.request().postDataJSON();
    this.uploads.push(cid);
    return route.fulfill({ json: { cid, success: true }, headers: cors });
  }

  private github(route: Route, url: URL) {
    const users = url.pathname.match(/^\/users\/([^/]+)\/keys$/);
    if (users) {
      const keys = this.content.githubKeys?.[users[1]!];
      if (!keys)
        return route.fulfill({
          status: 404,
          json: { message: "Not Found" },
          headers: cors,
        });
      return route.fulfill({
        json: keys.map((key, id) => ({ id, key })),
        headers: cors,
      });
    }
    const repos = url.pathname.match(
      /^\/repos\/([^/]+\/[^/]+)\/(commits|readme)(?:\/(\w+))?$/,
    );
    const repo = repos && this.content.github?.[repos[1]!];
    if (!repos || !repo)
      return route.fulfill({
        status: 404,
        json: { message: "Not Found" },
        headers: cors,
      });
    const [, name, kind, sha] = repos;
    if (kind === "readme") {
      return repo.readme === undefined
        ? route.fulfill({
            status: 404,
            json: { message: "Not Found" },
            headers: cors,
          })
        : route.fulfill({ body: repo.readme, headers: cors });
    }
    const commits = repo.commits.map((c) => ({
      sha: c.sha,
      html_url: `https://github.com/${name}/commit/${c.sha}`,
      commit: {
        message: c.message,
        author: {
          name: c.author,
          email: `${c.author}@example.com`,
          date: c.date,
        },
        committer: {
          name: c.author,
          email: `${c.author}@example.com`,
          date: c.date,
        },
      },
      author: { html_url: `https://github.com/${c.author}` },
    }));
    if (sha) {
      const commit = commits.find((c) => c.sha === sha);
      if (!commit)
        return route.fulfill({
          status: 404,
          json: { message: "Not Found" },
          headers: cors,
        });
      return route.fulfill({ json: commit, headers: cors });
    }
    const page = Number(url.searchParams.get("page") ?? 1);
    const perPage = Number(url.searchParams.get("per_page") ?? 30);
    return route.fulfill({
      json: commits.slice((page - 1) * perPage, page * perPage),
      headers: cors,
    });
  }
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function host(url: string): string {
  return new URL(url).host;
}
