import type {
  Proposal as ContractProposal,
  Project,
} from "../../packages/tansu";
import type { Vote } from "../../packages/tansu";
import type { ProposalSummary } from "../service/ProposalService";
import {
  VoteType,
  type EarlyExecution,
  type Proposal,
  type ProposalStatus,
  type ProposalView,
  type ProposalViewStatus,
  type VoteStatus,
} from "types/proposal";
import {
  buildRadicleBrowseUrl,
  getRepositoryProvider,
  normalizeRepositoryUrl,
} from "./editLinkFunctions";

export function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const ellipsis = "...";
  const charsToShow = maxLength - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return (
    str.substring(0, frontChars) +
    ellipsis +
    str.substring(str.length - backChars)
  );
}

/** A tansu.toml value that must be text: anyone writes that file. */
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

export function extractConfigData(tomlData: any, project: Project) {
  const doc =
    typeof tomlData.DOCUMENTATION === "object" && tomlData.DOCUMENTATION
      ? tomlData.DOCUMENTATION
      : {};
  const fullName = text(doc.ORG_DBA) || project.name;
  const projectType =
    tomlData.PROJECT_TYPE === "GENERIC" ? "GENERIC" : "SOFTWARE";
  const canonicalRepositoryUrl =
    normalizeRepositoryUrl(project.config.url) || project.config.url || "";
  const repositoryProvider = getRepositoryProvider(canonicalRepositoryUrl);
  // The repository is the one on chain; tansu.toml only names the Radicle
  // seed that serves it.
  const repositoryLink =
    repositoryProvider === "radicle"
      ? buildRadicleBrowseUrl(
          canonicalRepositoryUrl,
          text(doc.ORG_REPOSITORY_SEED),
        )
      : canonicalRepositoryUrl;
  const social = (key: string, field: string) =>
    text(doc[key]) ? { [field]: text(doc[key]) } : {};

  return {
    projectName: project.name,
    projectFullName: fullName,
    projectType: projectType,
    logoImageLink: text(doc.ORG_LOGO),
    thumbnailImageLink: text(doc.ORG_THUMBNAIL),
    description: text(doc.ORG_DESCRIPTION),
    organizationName: text(doc.ORG_NAME),
    officials: {
      websiteLink: text(doc.ORG_URL),
      githubLink: repositoryLink,
    },
    socialLinks: {
      ...social("ORG_TWITTER", "twitter"),
      ...social("ORG_TELEGRAM", "telegram"),
      ...social("ORG_DISCORD", "discord"),
    },
    handles: maintainerHandles(tomlData),
  };
}

/** ACCOUNTS[i]'s handle is PRINCIPALS[i]'s, when both are there. */
function maintainerHandles(tomlData: any): Record<string, string> {
  const accounts: unknown[] = Array.isArray(tomlData.ACCOUNTS)
    ? tomlData.ACCOUNTS
    : [];
  return Object.fromEntries(
    accounts.flatMap((address, i) => {
      const principal = tomlData.PRINCIPALS?.[i];
      const handle = principal?.github || principal?.radicle;
      return typeof address === "string" && typeof handle === "string"
        ? [[address, handle]]
        : [];
    }),
  );
}

export function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const modifyProposalStatusToView = (
  status: ProposalStatus,
  endDate: number,
): ProposalViewStatus => {
  if (status === "approved") {
    return "approved";
  }
  if (status === "malicious" || status === "vetoed") {
    return status;
  }
  if (status === "active") {
    if (endDate !== null) {
      const endDateTimestamp = new Date(endDate * 1000);
      const currentTime = new Date();

      if (endDateTimestamp < currentTime) {
        return "voted";
      }
      return "active";
    }
  }
  return status;
};

/** Max vote weight on-chain (u32). */
export const MAX_VOTE_WEIGHT_U32 = 4_294_967_295;

/**
 * Normalizes Soroban Option<string> from RPC/bindings into a contract address or null.
 */
export function parseContractOptionString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "object" && value !== null && "tag" in value) {
    const tagged = value as { tag: string; values?: unknown[] };
    if (tagged.tag === "None") return null;
    if (tagged.tag === "Some" && Array.isArray(tagged.values)) {
      return parseContractOptionString(tagged.values[0]);
    }
  }
  return null;
}

export const hasUserVoted = (
  voteStatus: VoteStatus | undefined,
  userAddress: string | undefined,
): boolean => {
  if (!voteStatus || !userAddress) return false;
  const normalizedAddress = userAddress.toLowerCase();
  const allVoters = [
    ...(voteStatus.approve?.voters || []),
    ...(voteStatus.reject?.voters || []),
    ...(voteStatus.abstain?.voters || []),
  ];
  return allVoters.some(
    (voter) => voter.address.toLowerCase() === normalizedAddress,
  );
};

/** Active proposals only: how many the user has voted on vs still need to. */
export function countVoterProposalStats(
  proposals: Pick<ProposalView, "status" | "voters">[],
  userAddress: string | undefined,
): { voted: number; toVote: number } {
  let voted = 0;
  let toVote = 0;
  for (const proposal of proposals) {
    if (proposal.status !== "active") continue;
    if (votedOn(proposal, userAddress)) voted += 1;
    else toVote += 1;
  }
  return { voted, toVote };
}

const ORDER_SEED_KEY = "tansu_order_seed";
let memorySeed: string | undefined;

/**
 * This visitor's seed for the order of proposals to vote on: made once and
 * kept, so their order never changes as they vote or come back.
 */
export function visitorSeed(): string {
  try {
    const stored = localStorage.getItem(ORDER_SEED_KEY);
    if (stored) return stored;
    const seed = crypto.randomUUID();
    localStorage.setItem(ORDER_SEED_KEY, seed);
    return seed;
  } catch {
    return (memorySeed ??= crypto.randomUUID());
  }
}

/**
 * A proposal's place in a seed's order (FNV-1a, then murmur3's finalizer):
 * its own, so the others keep theirs as proposals come and go.
 */
function rank(seed: string, project: string, id: number): number {
  let hash = 0x811c9dc5;
  for (const char of `${seed}:${project}:${id}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * A list's two groups. In progress (voting or waiting to be executed): for a
 * connected voter, the ones they have not voted on yet first, in the order of
 * their seed, then the rest newest first. Done: newest first.
 */
export function orderProposalsForVoter(
  proposals: ProposalView[],
  connectedAddress: string | undefined,
  seed: string = visitorSeed(),
): { inProgress: ProposalView[]; done: ProposalView[] } {
  const newestFirst = (a: ProposalView, b: ProposalView) => b.id - a.id;
  const isInProgress = (p: ProposalView) =>
    p.status === "active" || p.status === "voted";
  const isToVote = (p: ProposalView) =>
    !!connectedAddress &&
    p.status === "active" &&
    !votedOn(p, connectedAddress);

  const toVote = proposals
    .filter(isToVote)
    .map((p) => ({ p, rank: rank(seed, p.projectName, p.id) }))
    .sort((a, b) => a.rank - b.rank || b.p.id - a.p.id)
    .map(({ p }) => p);
  const waiting = proposals
    .filter((p) => isInProgress(p) && !isToVote(p))
    .sort(newestFirst);
  const done = proposals.filter((p) => !isInProgress(p)).sort(newestFirst);
  return { inProgress: [...toVote, ...waiting], done };
}

export const modifyProposalToView = (
  proposal: Proposal,
  projectName: string,
): ProposalView => {
  const proposalStatusView = modifyProposalStatusToView(
    proposal.status,
    proposal.voting_ends_at,
  );
  const proposalView: ProposalView = {
    id: proposal.id,
    title: proposal.title,
    proposer: proposal.proposer,
    projectName: projectName,
    publicVoting: proposal.publicVoting,
    ipfsLink: proposal.ipfs,
    endDate: proposal.voting_ends_at,
    voteStatus: proposal.voteStatus,
    voters: [
      ...proposal.voteStatus.approve.voters,
      ...proposal.voteStatus.reject.voters,
      ...proposal.voteStatus.abstain.voters,
    ].map((voter) => voter.address),
    status: proposalStatusView as ProposalViewStatus,
    tokenContract: proposal.tokenContract ?? null,
  };

  return proposalView;
};

/** A proposal as a list shows it, from its summary: who voted, no ballots. */
export const summaryToView = (
  summary: ProposalSummary,
  projectName: string,
): ProposalView => ({
  ...modifyProposalToView(
    modifyProposalFromContract(summary.proposal),
    projectName,
  ),
  voters: summary.voters,
});

/**
 * Whether a maintainer can execute a pending proposal before its normal time
 * (`executableAt`, in ms), as `execute` checks: the finality threshold
 * (percent) of the project's current maintainers voted on it. Null otherwise.
 */
export function earlyExecution(
  proposal: Pick<ProposalView, "status" | "endDate" | "voters">,
  maintainers: string[],
  threshold: number | undefined,
  executableAt: number | undefined,
  now: number,
): EarlyExecution | null {
  if (threshold === undefined || executableAt === undefined) return null;
  if (now >= executableAt || maintainers.length === 0) return null;
  if (proposal.status !== "active" && proposal.status !== "voted") return null;
  const voted = maintainers.filter((m) => proposal.voters.includes(m)).length;
  if (voted * 100 < maintainers.length * threshold) return null;
  return {
    voted,
    total: maintainers.length,
    executableAt,
    running: proposal.endDate * 1000 > now,
  };
}

/** Whether `address` voted on a listed proposal. */
export const votedOn = (
  proposal: Pick<ProposalView, "voters">,
  address: string | undefined,
) => !!address && proposal.voters.includes(address);

/** Normalize contract proposal status; handles both { tag: "Approved" } and string/array RPC formats. */
function normalizeProposalStatus(status: unknown): ProposalStatus {
  const tag =
    typeof status === "object" && status !== null && "tag" in status
      ? (status as { tag: string }).tag
      : typeof status === "string"
        ? status
        : Array.isArray(status) && status.length > 0
          ? status[0]
          : "";
  const normalized = (typeof tag === "string" ? tag : "").toLocaleLowerCase();
  if (normalized === "malicious" || normalized === "vetoed") return normalized;
  if (["active", "approved", "rejected", "cancelled"].includes(normalized)) {
    return normalized as ProposalStatus;
  }
  return "active";
}

/**
 * Maps contract proposal to app shape. Status is always from on-chain data
 * (get_proposal); for executed proposals it is never derived client-side.
 */
export const modifyProposalFromContract = (
  proposal: ContractProposal,
): Proposal => {
  const status = normalizeProposalStatus(proposal.status);
  const tokenContract = parseContractOptionString(
    proposal.vote_data.token_contract,
  );
  const baseFields = {
    tokenContract,
  };
  if (proposal.vote_data.public_voting) {
    const publicVotes = proposal.vote_data.votes.filter(
      (v: Vote) => v.tag === "PublicVote",
    );

    // Filter out invalid votes once at the top
    const validVotes = publicVotes.filter((v: Vote) => {
      const voteData = (v as any).values?.[0];
      return voteData?.vote_choice?.tag && voteData?.address;
    });

    const voters_approve = validVotes.filter((v: Vote) => {
      const voteData = (v as any).values?.[0];
      return voteData.vote_choice.tag === "Approve";
    });
    const voters_reject = validVotes.filter((v: Vote) => {
      const voteData = (v as any).values?.[0];
      return voteData.vote_choice.tag === "Reject";
    });
    const voters_abstain = validVotes.filter((v: Vote) => {
      const voteData = (v as any).values?.[0];
      return voteData.vote_choice.tag === "Abstain";
    });

    const sumWeight = (arr: Vote[]) =>
      arr.reduce((acc, v) => {
        const voteData = (v as any).values?.[0];
        return acc + (voteData.weight ?? 1);
      }, 0);

    return {
      id: proposal.id,
      title: proposal.title,
      ipfs: proposal.ipfs,
      proposer: proposal.proposer,
      publicVoting: proposal.vote_data.public_voting,
      status,
      voting_ends_at: Number(proposal.vote_data.voting_ends_at),
      outcome_contracts: proposal.outcome_contracts || null,
      ...baseFields,
      voteStatus: {
        approve: {
          voteType: VoteType.APPROVE,
          score: sumWeight(voters_approve),
          voters: voters_approve.map((voter: Vote) => {
            const voteData = (voter as any).values?.[0];
            return {
              address: voteData.address,
              image: null,
              name: "",
              github: "",
            };
          }),
        },
        reject: {
          voteType: VoteType.REJECT,
          score: sumWeight(voters_reject),
          voters: voters_reject.map((voter: Vote) => {
            const voteData = (voter as any).values?.[0];
            return {
              address: voteData.address,
              image: null,
              name: "",
              github: "",
            };
          }),
        },
        abstain: {
          voteType: VoteType.CANCEL,
          score: sumWeight(voters_abstain),
          voters: voters_abstain.map((voter: Vote) => {
            const voteData = (voter as any).values?.[0];
            return {
              address: voteData.address,
              image: null,
              name: "",
              github: "",
            };
          }),
        },
      },
    };
  }
  // Anonymous voting – vote choices are encrypted until execution, but addresses
  // are public so maintainers can still remove malicious votes. Expose addresses
  // in approve.voters (scores stay 0, choices unknown).
  const anonymousVoters = proposal.vote_data.votes
    .filter(
      (v: Vote) => v.tag === "AnonymousVote" && (v as any).values?.[0]?.address,
    )
    .map((v: Vote) => {
      const voteData = (v as any).values?.[0];
      return { address: voteData.address, image: null, name: "", github: "" };
    });

  return {
    id: proposal.id,
    title: proposal.title,
    ipfs: proposal.ipfs,
    proposer: proposal.proposer,
    publicVoting: proposal.vote_data.public_voting,
    status,
    voting_ends_at: Number(proposal.vote_data.voting_ends_at),
    outcome_contracts: proposal.outcome_contracts || null,
    ...baseFields,
    voteStatus: {
      approve: {
        voteType: VoteType.APPROVE,
        score: 0,
        voters: anonymousVoters,
      },
      reject: { voteType: VoteType.REJECT, score: 0, voters: [] },
      abstain: { voteType: VoteType.CANCEL, score: 0, voters: [] },
    },
  } as Proposal;
};

/** Feedback after an action: the kit's toasts (components/ui). */
export { toast } from "components/ui/toast";
