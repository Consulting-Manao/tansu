/**
 * Testnet, as the e2e flows use it: accounts funded by friendbot, and the
 * Tansu contract driven straight through its bindings to set up what a flow
 * starts from and to check what the flow left on-chain. Uploads go through
 * the real IPFS worker, with the signed envelope as proof, as the dapp does.
 */
import {
  Keypair,
  contract,
  scValToNative,
  type xdr,
} from "@stellar/stellar-sdk";
import {
  Client,
  type Badge,
  type OutcomeContract,
  type Vote,
} from "../../packages/tansu/src/index.ts";
import { getIpfsUrl, packFilesToCar } from "../../src/utils/ipfsFunctions.ts";
import { deriveProjectKey } from "../../src/utils/projectKey.ts";
import { writeTansuToml } from "../../src/utils/tansuToml.ts";
import { ProjectType } from "../../src/types/projectConfig.ts";
import { E2E_ENV } from "./env";

const {
  PUBLIC_SOROBAN_RPC_URL: rpcUrl,
  PUBLIC_SOROBAN_NETWORK_PASSPHRASE: networkPassphrase,
  PUBLIC_TANSU_CONTRACT_ID: contractId,
  PUBLIC_DELEGATION_API_URL: uploadUrl,
  PUBLIC_HORIZON_URL: horizonUrl,
} = E2E_ENV;

/** The Tansu repository on Radicle: no rate limit. */
export const RADICLE_REPO = "rad:zssaAF91kxuquZmZCV2SiK2FNX6s";

/** Its own seed, which tansu.toml names, as the Tansu project's does. */
const RADICLE_SEED_URL = `https://radicle.network/nodes/radicle.consulting-manao.com/${RADICLE_REPO}`;

/** A project name no earlier run used (alphanumeric, as names must be). */
export function uniqueName(suffix: string): string {
  return `e2e${Date.now().toString(36)}${suffix}`.slice(0, 30);
}

/** Try `attempt` up to three times while `retry` accepts its error. */
async function withRetries<T>(
  attempt: () => Promise<T>,
  retry: (error: Error) => boolean,
): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      if (tries === 3 || !retry(error as Error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3_000 * tries));
    }
  }
}

/** A new account holding friendbot's 10 000 XLM; friendbot has bad moments. */
export async function fundedKeypair(): Promise<Keypair> {
  const keypair = Keypair.random();
  await withRetries(
    async () => {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${keypair.publicKey()}`,
        { signal: AbortSignal.timeout(60_000) },
      );
      if (!response.ok) {
        throw new Error(
          `friendbot ${response.status}: ${await response.text()}`,
        );
      }
    },
    (error) => /friendbot 5\d\d|timed out|fetch failed/i.test(error.message),
  );
  return keypair;
}

/**
 * Build and land a call again when a concurrent run changed what it writes
 * between its simulation and its inclusion (the shared project list grows).
 */
const landAgain = (error: Error) =>
  /exceeds amount specified/.test(error.message);

/** The Tansu contract, read-only or as `keypair`. */
function tansu(keypair?: Keypair): Client {
  return new Client({
    contractId,
    rpcUrl,
    networkPassphrase,
    ...(keypair && {
      publicKey: keypair.publicKey(),
      ...contract.basicNodeSigner(keypair, networkPassphrase),
    }),
  });
}

const projectKey = deriveProjectKey;

/** Files packed for a call, and their names. */
type Pack = { cid: string; carBlob: Blob; names: string[] };

async function packFiles(files: File[]): Promise<Pack> {
  return {
    ...(await packFilesToCar(files)),
    names: files.map((f) => f.name),
  };
}

/**
 * Sign `tx`, upload the packed files with the signed envelope as proof, then
 * send it and wait for it to land; like the dapp's TxService, without a
 * wallet. Results are read back from the contract, not parsed from the
 * transaction. The files are served before it returns: a gateway takes a
 * while with new ones, and the pages under test read them there.
 */
async function land<T>(
  tx: contract.AssembledTransaction<T>,
  pack?: Pack,
): Promise<void> {
  await tx.sign();
  if (pack) {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cid: pack.cid,
        car: Buffer.from(await pack.carBlob.arrayBuffer()).toString("base64"),
        signedTxXdr: tx.signed!.toXDR(),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`upload ${response.status}: ${await response.text()}`);
    }
  }
  const sent = await tx.send();
  const response = sent.getTransactionResponse;
  if (response?.status !== "SUCCESS") {
    const events = (response as { diagnosticEventsXdr?: unknown[] })
      ?.diagnosticEventsXdr;
    throw new Error(
      `${tx.options.method} ${response?.status}: ${JSON.stringify(events ?? response)}`,
    );
  }
  if (pack) {
    await Promise.all(
      pack.names.map((name) => read.ipfs(pack.cid, `/${name}`)),
    );
  }
}

/**
 * tansu.toml as the create-project form writes it, over `toml`: values the
 * form does not manage.
 */
function projectFiles(
  name: string,
  maintainers: Keypair[],
  {
    toml = {},
    fullName = `${name} project`,
  }: { toml?: Record<string, unknown>; fullName?: string } = {},
): File[] {
  const file = writeTansuToml(
    {
      projectType: ProjectType.SOFTWARE,
      maintainers: maintainers.map((m) => m.publicKey()),
      handles: maintainers.map((_, i) => `maintainer${i}`),
      fullName,
      orgName: "E2E Labs",
      orgUrl: "https://tansu.dev",
      orgLogo: "",
      orgDescription: `The ${name} project, set up by the e2e flows.`,
      repositoryUrl: RADICLE_SEED_URL,
      repositoryProvider: "radicle",
    },
    toml,
  );
  return [new File([file], "tansu.toml")];
}

/**
 * Register `name`, maintained by `maintainers` (the first signs). Short
 * governance periods let a flow create, vote on and execute a proposal in
 * one run.
 */
export async function registerProject(
  name: string,
  maintainers: Keypair[],
  periods: { minVotingPeriod?: number; executeDelay?: number } = {},
  toml: Record<string, unknown> = {},
): Promise<void> {
  const [first] = maintainers;
  const pack = await packFiles(projectFiles(name, maintainers, { toml }));
  await withRetries(async () => {
    const tx = await tansu(first).register({
      maintainer: first!.publicKey(),
      name,
      maintainers: maintainers.map((m) => m.publicKey()),
      url: RADICLE_REPO,
      ipfs: pack.cid,
      min_voting_period:
        periods.minVotingPeriod === undefined
          ? undefined
          : BigInt(periods.minVotingPeriod),
      execute_delay:
        periods.executeDelay === undefined
          ? undefined
          : BigInt(periods.executeDelay),
      attestation_threshold: undefined,
    });
    await land(tx, pack);
  }, landAgain);
}

/** A new tansu.toml for `name`, as another maintainer would write it. */
export async function updateConfig(
  maintainer: Keypair,
  name: string,
  maintainers: Keypair[],
  files: { toml?: Record<string, unknown>; fullName?: string } = {},
) {
  const pack = await packFiles(projectFiles(name, maintainers, files));
  const tx = await tansu(maintainer).update_config({
    maintainer: maintainer.publicKey(),
    key: projectKey(name),
    maintainers: maintainers.map((m) => m.publicKey()),
    url: RADICLE_REPO,
    ipfs: pack.cid,
    min_voting_period: undefined,
    execute_delay: undefined,
    attestation_threshold: undefined,
  });
  await land(tx, pack);
}

/** Make `name` an organization of the projects with these keys. */
export async function setSubProjects(
  maintainer: Keypair,
  name: string,
  keys: Buffer[],
) {
  const tx = await tansu(maintainer).set_sub_projects({
    maintainer: maintainer.publicKey(),
    project_key: projectKey(name),
    sub_projects: keys,
  });
  await land(tx);
}

/** Make `member` a member, with a profile.json. */
export async function join(member: Keypair, profileName: string) {
  const pack = await packFiles([
    new File(
      [JSON.stringify({ name: profileName, description: "", social: "" })],
      "profile.json",
    ),
  ]);
  const tx = await tansu(member).add_member({
    member_address: member.publicKey(),
    meta: pack.cid,
    git_identity: undefined,
    git_pubkey: undefined,
    git_sig: undefined,
  });
  await land(tx, pack);
}

export async function setBadges(
  maintainer: Keypair,
  name: string,
  member: string,
  badges: Badge[],
) {
  const tx = await tansu(maintainer).set_badges({
    maintainer: maintainer.publicKey(),
    key: projectKey(name),
    member,
    badges,
  });
  await land(tx);
}

/** Open a proposal ending in `endsIn` seconds; returns its id. */
export async function createProposal(
  proposer: Keypair,
  name: string,
  title: string,
  endsIn: number,
  {
    outcomeContracts,
    publicVoting = true,
  }: { outcomeContracts?: OutcomeContract[]; publicVoting?: boolean } = {},
): Promise<number> {
  const pack = await packFiles([
    new File([`# ${title}\n\nSet up by the e2e flows.`], "proposal.md"),
  ]);
  const tx = await tansu(proposer).create_proposal({
    proposer: proposer.publicKey(),
    project_key: projectKey(name),
    title,
    ipfs: pack.cid,
    voting_ends_at: BigInt(Math.floor(Date.now() / 1000) + endsIn),
    public_voting: publicVoting,
    token_contract: undefined,
    outcome_contracts: outcomeContracts,
  });
  await land(tx, pack);
  // Ids count up from 0 in each project; the newest with this title is it.
  let id = -1;
  for (let next = 0; ; next++) {
    // A missing id simulates to the contract's error, not a proposal.
    const proposal = await read.proposal(name, next).catch(() => undefined);
    if (typeof proposal?.title !== "string") break;
    if (proposal.title === title) id = next;
  }
  if (id < 0) throw new Error(`proposal "${title}" not found`);
  return id;
}

/** Cast `vote` straight to the contract, as no dapp would. */
export async function castVote(
  voter: Keypair,
  name: string,
  id: number,
  vote: Vote,
) {
  const tx = await tansu(voter).vote({
    voter: voter.publicKey(),
    project_key: projectKey(name),
    proposal_id: id,
    vote,
  });
  await land(tx);
}

export const read = {
  /** An account's latest payment, with its transaction's memo. */
  lastPayment: async (address: string) => {
    const response = await fetch(
      `${horizonUrl}/accounts/${address}/payments?order=desc&limit=1&join=transactions`,
      { signal: AbortSignal.timeout(30_000) },
    );
    const [payment] = (await response.json())._embedded.records;
    return payment as {
      from: string;
      to: string;
      amount: string;
      transaction: { memo?: string };
    };
  },
  /** A file in an IPFS directory, once the gateway serves it: a new one takes a while. */
  ipfs: async (cid: string, path: string): Promise<Response> => {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(getIpfsUrl(cid, path), {
        signal: AbortSignal.timeout(30_000),
      }).catch((error: Error) => error);
      if (response instanceof Response && response.ok) return response;
      if (attempt === 6) {
        throw new Error(
          `${cid}${path}: ${response instanceof Response ? response.status : response.message}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  },
  project: async (name: string) =>
    (await tansu().get_project({ project_key: projectKey(name) })).result,
  proposal: async (name: string, id: number) =>
    (
      await tansu().get_proposal({
        project_key: projectKey(name),
        proposal_id: id,
      })
    ).result,
  member: async (address: string) =>
    (await tansu().get_member({ member_address: address })).result,
  badges: async (name: string) =>
    (await tansu().get_badges({ key: projectKey(name) })).result,
  commit: async (name: string) =>
    (await tansu().get_commit({ project_key: projectKey(name) })).result,
  anonymousConfig: async (name: string) =>
    (
      await tansu().get_anonymous_voting_config({
        project_key: projectKey(name),
      })
    ).result,
  /** The commitments to anonymous `votes` and `seeds`, as the dapp builds them. */
  commitments: async (name: string, votes: bigint[], seeds: bigint[]) =>
    (
      await tansu().build_commitments_from_votes({
        project_key: projectKey(name),
        votes,
        seeds,
      })
    ).result,
  /**
   * A proposal's outcome calls with their arguments as stored: the bindings
   * decode `Val` arguments to plain values, which hides their ScVal types.
   */
  outcomeCalls: async (name: string, id: number) => {
    const tx = await tansu().get_proposal({
      project_key: projectKey(name),
      proposal_id: id,
    });
    const field = (value: xdr.ScVal, key: string) =>
      (value as any).map.find(
        (entry: { key: xdr.ScVal }) => scValToNative(entry.key) === key,
      )?.val as xdr.ScVal;
    const calls = field(tx.simulationData.result.retval, "outcome_contracts");
    return ((calls as any).vec ?? []).map((call: xdr.ScVal) => ({
      address: scValToNative(field(call, "address")) as string,
      execute_fn: scValToNative(field(call, "execute_fn")) as string,
      args: (field(call, "args") as any).vec as xdr.ScVal[],
    }));
  },
};
