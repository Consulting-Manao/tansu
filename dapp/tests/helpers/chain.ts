import type { BrowserContext, Route } from "@playwright/test";
import {
  Address,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import sha3 from "js-sha3";
import {
  Badge,
  Client,
  type Badges,
  type Member,
  type Project,
  type Proposal,
  type Vote,
} from "../../packages/tansu/src/index.ts";
import { E2E_ENV } from "./env";

const PASSPHRASE = E2E_ENV.PUBLIC_SOROBAN_NETWORK_PASSPHRASE;
const TANSU = E2E_ENV.PUBLIC_TANSU_CONTRACT_ID;
const LEDGER = 1_000;
const PROPOSALS_PER_PAGE = 9;
const PROJECTS_PER_PAGE = 10;

const { spec } = new Client({
  contractId: TANSU,
  networkPassphrase: PASSPHRASE,
  rpcUrl: E2E_ENV.PUBLIC_SOROBAN_RPC_URL,
});

export const projectKey = (name: string) =>
  Buffer.from(sha3.keccak_256(name), "hex");

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** A contract error, reported the way the host does. */
class ContractError {
  constructor(readonly code: number) {}
}

export interface ChainProject {
  project: Project;
  badges?: Partial<Badges>;
  commit?: string;
  proposals?: Proposal[];
}

interface ProjectState {
  project: Project;
  badges: Badges;
  commit?: string;
  proposals: Proposal[];
}

const BADGE_ROLES: [Badge, keyof Badges][] = [
  [Badge.Developer, "developer"],
  [Badge.Triage, "triage"],
  [Badge.Community, "community"],
  [Badge.Verified, "verified"],
];

/**
 * An in-memory Tansu contract behind a mocked Soroban RPC: enough of it for
 * the flows the e2e tests walk through. Simulations read the state; a sent
 * transaction applies its call and records the return value.
 */
export class FakeChain {
  /** Contract functions in the order transactions sent them. */
  readonly sent: string[] = [];
  /** Calls the fake cannot answer: a test should end with none. */
  readonly unexpected: string[] = [];
  private readonly projects = new Map<string, ProjectState>();
  private readonly members = new Map<string, Member>();
  private readonly transactions = new Map<
    string,
    { envelope: string; value: xdr.ScVal }
  >();

  constructor(
    projects: ChainProject[] = [],
    members: Record<string, Member> = {},
  ) {
    for (const p of projects) {
      this.projects.set(hex(projectKey(p.project.name)), {
        project: p.project,
        badges: {
          developer: [],
          triage: [],
          community: [],
          verified: [],
          ...p.badges,
        },
        ...(p.commit ? { commit: p.commit } : {}),
        proposals: p.proposals ?? [],
      });
    }
    for (const [address, member] of Object.entries(members)) {
      this.members.set(address, member);
    }
  }

  project(name: string): ProjectState {
    return this.byKey(projectKey(name));
  }

  member(address: string): Member | undefined {
    return this.members.get(address);
  }

  async route(context: BrowserContext): Promise<void> {
    const host = new URL(E2E_ENV.PUBLIC_SOROBAN_RPC_URL).host;
    await context.route(
      (url) => url.host === host,
      (route) => this.answer(route),
    );
  }

  private async answer(route: Route): Promise<void> {
    const { id, method, params } = route.request().postDataJSON();
    const reply = (body: object) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id, ...body }),
      });
    try {
      await this.handle(method, params, reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.unexpected.push(`${method}: ${message}`);
      await reply({ error: { code: -32603, message } });
    }
  }

  private async handle(
    method: string,
    params: any,
    reply: (body: object) => Promise<void>,
  ): Promise<void> {
    const ledger = {
      latestLedger: LEDGER,
      latestLedgerCloseTime: `${Math.floor(Date.now() / 1000)}`,
    };

    switch (method) {
      case "simulateTransaction": {
        const call = decodeCall(params.transaction);
        try {
          const value = this.invoke(call.fn, call.args, false);
          return reply({
            result: {
              ...ledger,
              minResourceFee: "100",
              results: [
                { auth: [], xdr: encode(call.fn, value).toXdr("base64") },
              ],
              transactionData: new SorobanDataBuilder().build().toXdr("base64"),
            },
          });
        } catch (error) {
          if (!(error instanceof ContractError)) throw error;
          return reply({
            result: {
              ...ledger,
              error: `HostError: Error(Contract, #${error.code})`,
            },
          });
        }
      }
      case "sendTransaction": {
        const tx = TransactionBuilder.fromXdr(params.transaction, PASSPHRASE);
        const call = decodeCall(params.transaction);
        // Simulated first by the app, so a contract error here is a bug.
        const value = encode(call.fn, this.invoke(call.fn, call.args, true));
        const hash = Buffer.from(tx.hash()).toString("hex");
        this.sent.push(call.fn);
        this.transactions.set(hash, { envelope: params.transaction, value });
        return reply({ result: { ...ledger, status: "PENDING", hash } });
      }
      case "getTransaction": {
        const tx = this.transactions.get(params.hash);
        if (!tx) return reply({ result: { ...ledger, status: "NOT_FOUND" } });
        return reply({
          result: {
            ...ledger,
            status: "SUCCESS",
            oldestLedger: 1,
            oldestLedgerCloseTime: "0",
            ledger: LEDGER,
            createdAt: ledger.latestLedgerCloseTime,
            applicationOrder: 1,
            feeBump: false,
            txHash: params.hash,
            envelopeXdr: tx.envelope,
            resultXdr: new xdr.TransactionResult({
              feeCharged: 100n,
              result: xdr.TransactionResultResult.txSuccess([]),
              ext: xdr.TransactionResultExt.v0(),
            }).toXdr("base64"),
            resultMetaXdr: xdr.TransactionMeta.v3(
              new xdr.TransactionMetaV3({
                ext: xdr.ExtensionPoint.v0(),
                txChangesBefore: [],
                operations: [],
                txChangesAfter: [],
                sorobanMeta: new xdr.SorobanTransactionMeta({
                  ext: xdr.SorobanTransactionMetaExt.v0(),
                  events: [],
                  returnValue: tx.value,
                  diagnosticEvents: [],
                }),
              }),
            ).toXdr("base64"),
          },
        });
      }
      case "getLedgerEntries": {
        // Every account exists: that is all a transaction needs to be built.
        const entries = (params.keys as string[]).flatMap((key) => {
          const ledgerKey = xdr.LedgerKey.fromXdr(key, "base64") as any;
          if (ledgerKey.type !== "account") return [];
          const account = new xdr.AccountEntry({
            accountId: ledgerKey.account.accountId,
            balance: 10_000_000_000n,
            seqNum: 1n,
            numSubEntries: 0,
            inflationDest: null,
            flags: 0,
            homeDomain: "",
            thresholds: Buffer.from([1, 0, 0, 0]),
            signers: [],
            ext: xdr.AccountEntryExt.v0(),
          } as any);
          return [
            {
              key,
              xdr: xdr.LedgerEntryData.account(account).toXdr("base64"),
              lastModifiedLedgerSeq: LEDGER,
            },
          ];
        });
        return reply({ result: { latestLedger: LEDGER, entries } });
      }
      default:
        throw new Error("not mocked");
    }
  }

  private byKey(key: Uint8Array): ProjectState {
    const state = this.projects.get(hex(key));
    if (!state) throw new ContractError(200);
    return state;
  }

  private proposal(key: Uint8Array, id: number): Proposal {
    const proposal = this.byKey(key).proposals[id];
    if (!proposal) throw new ContractError(301);
    return proposal;
  }

  /** One contract call; writes change the state only when `apply` is set. */
  private invoke(fn: string, a: any[], apply: boolean): unknown {
    switch (fn) {
      case "get_projects": {
        const page = [...this.projects.values()].slice(
          a[0] * PROJECTS_PER_PAGE,
          (a[0] + 1) * PROJECTS_PER_PAGE,
        );
        if (!page.length) throw new ContractError(302);
        return page.map((p) => p.project);
      }
      case "get_project":
        return this.byKey(a[0]).project;
      case "get_sub_projects":
        return this.byKey(a[0]).project.sub_projects ?? [];
      case "get_commit": {
        const { commit } = this.byKey(a[0]);
        if (!commit) throw new ContractError(300);
        return commit;
      }
      case "get_badges":
        return (
          this.projects.get(hex(a[0]))?.badges ?? {
            developer: [],
            triage: [],
            community: [],
            verified: [],
          }
        );
      case "get_member": {
        const member = this.members.get(a[0]);
        if (!member) throw new ContractError(204);
        return member;
      }
      case "get_max_weight": {
        const badges = this.members
          .get(a[1])
          ?.projects.find((p) => hex(p.project) === hex(a[0]))?.badges;
        return badges?.length
          ? badges.reduce((sum, badge) => sum + badge, 0)
          : Badge.Default;
      }
      case "get_dao": {
        const proposals = this.byKey(a[0]).proposals.slice(
          a[1] * PROPOSALS_PER_PAGE,
          (a[1] + 1) * PROPOSALS_PER_PAGE,
        );
        // Votes live apart from the proposals on chain: get_proposal adds them.
        return {
          proposals: proposals.map((p) => ({
            ...p,
            vote_data: { ...p.vote_data, votes: [] },
          })),
        };
      }
      case "get_proposal":
        return this.proposal(a[0], a[1]);
      case "get_anonymous_voting_config":
        this.byKey(a[0]);
        throw new ContractError(303);
      case "get_conflict_of_interest":
      case "get_evidence":
      case "get_attestations":
        return [];
      case "get_attestation_threshold":
        return 51;
      case "get_attestation_finality":
        return {
          attested: 0,
          finalized_at: undefined,
          is_final: false,
          total: 0,
        };

      case "register": {
        const [, name, maintainers, url, ipfs] = a;
        const key = projectKey(name);
        if (this.projects.has(hex(key))) throw new ContractError(201);
        if (apply) {
          this.projects.set(hex(key), {
            project: {
              name,
              maintainers,
              config: { url, ipfs },
              sub_projects: undefined,
            },
            badges: { developer: [], triage: [], community: [], verified: [] },
            proposals: [],
          });
        }
        return key;
      }
      case "update_config": {
        const [, key, maintainers, url, ipfs] = a;
        const state = this.byKey(key);
        if (apply)
          state.project = {
            ...state.project,
            maintainers,
            config: { url, ipfs },
          };
        return undefined;
      }
      case "commit": {
        const state = this.byKey(a[1]);
        if (apply) state.commit = a[2];
        return undefined;
      }
      case "set_badges": {
        const [, key, address, badges] = a as [
          unknown,
          Uint8Array,
          string,
          Badge[],
        ];
        const state = this.byKey(key);
        const member = this.members.get(address);
        if (!member) throw new ContractError(204);
        if (apply) {
          for (const [badge, role] of BADGE_ROLES) {
            const holders = state.badges[role].filter((m) => m !== address);
            state.badges[role] = badges.includes(badge)
              ? [...holders, address]
              : holders;
          }
          member.projects = [
            ...member.projects.filter((p) => hex(p.project) !== hex(key)),
            { project: Buffer.from(key), badges },
          ];
        }
        return undefined;
      }
      case "add_member":
      case "update_member": {
        const [address, meta, git_identity, git_pubkey] = a;
        const existing = this.members.get(address);
        if (fn === "add_member" && existing) throw new ContractError(205);
        if (fn === "update_member" && !existing) throw new ContractError(204);
        if (apply) {
          this.members.set(address, {
            meta,
            git_identity: git_identity ?? undefined,
            git_pubkey: git_pubkey ? Buffer.from(git_pubkey) : undefined,
            projects: existing?.projects ?? [],
          });
        }
        return undefined;
      }
      case "create_proposal": {
        const [
          proposer,
          key,
          title,
          ipfs,
          voting_ends_at,
          public_voting,
          token_contract,
          outcome_contracts,
        ] = a;
        const state = this.byKey(key);
        const id = state.proposals.length;
        if (apply) {
          state.proposals.push({
            id,
            title,
            ipfs,
            proposer,
            status: { tag: "Active", values: undefined },
            outcome_contracts: outcome_contracts ?? undefined,
            vote_data: {
              public_voting,
              token_contract: token_contract ?? undefined,
              voting_ends_at,
              votes: [],
            },
          });
        }
        return id;
      }
      case "vote": {
        const [voter, key, id, vote] = a as [string, Uint8Array, number, Vote];
        const proposal = this.proposal(key, id);
        if (
          proposal.vote_data.votes.some((v) => v.values[0].address === voter)
        ) {
          throw new ContractError(400);
        }
        if (apply) proposal.vote_data.votes.push(vote);
        return undefined;
      }
      case "remove_vote": {
        const [, key, id, voter] = a;
        const proposal = this.proposal(key, id);
        const votes = proposal.vote_data.votes.filter(
          (v) => v.values[0].address !== voter,
        );
        if (votes.length === proposal.vote_data.votes.length)
          throw new ContractError(404);
        if (apply) proposal.vote_data.votes = votes;
        return undefined;
      }
      case "revoke_proposal": {
        const proposal = this.proposal(a[1], a[2]);
        if (apply) proposal.status = { tag: "Malicious", values: undefined };
        return undefined;
      }
      case "execute": {
        const proposal = this.proposal(a[1], a[2]);
        const tally = { Approve: 0, Reject: 0, Abstain: 0 };
        for (const vote of proposal.vote_data.votes) {
          if (vote.tag === "PublicVote") {
            tally[vote.values[0].vote_choice.tag] += vote.values[0].weight;
          }
        }
        const tag =
          tally.Approve > tally.Reject + tally.Abstain
            ? "Approved"
            : tally.Reject > tally.Approve + tally.Abstain
              ? "Rejected"
              : "Cancelled";
        const status = { tag, values: undefined } as Proposal["status"];
        if (apply) proposal.status = status;
        return status;
      }
      default:
        throw new Error(`The e2e chain does not implement ${fn}`);
    }
  }
}

function decodeCall(envelope: string): { fn: string; args: any[] } {
  const tx = TransactionBuilder.fromXdr(envelope, PASSPHRASE) as any;
  const call = tx.operations[0].func.invokeContract;
  const contract = Address.fromScAddress(call.contractAddress).toString();
  if (contract !== TANSU) {
    throw new Error(`The e2e chain only knows Tansu, not ${contract}`);
  }
  const fn = call.functionName.toString();
  const { inputs } = spec.getFunc(fn) as any;
  return {
    fn,
    args: call.args.map((arg: xdr.ScVal, i: number) =>
      spec.scValToNative(arg, inputs[i].type),
    ),
  };
}

function encode(fn: string, value: unknown): xdr.ScVal {
  const [output] = (spec.getFunc(fn) as any).outputs;
  return output ? spec.nativeToScVal(value, output) : xdr.ScVal.scvVoid();
}
