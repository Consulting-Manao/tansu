import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { votingPowerQuery } from "@service/MemberService";
import {
  executeDelayQuery,
  quorumReachedAtQuery,
} from "@service/ProposalService";
import { Notice } from "components/ui";
import { queryClient } from "@service/queryClient";
import { connect } from "@service/walletService";
import { Button, Card, LinkButton } from "components/ui";
import type { ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import { hasUserVoted } from "utils/utils";
import ConflictOfInterestModal from "./ConflictOfInterestModal";
import MarkMaliciousModal from "./MarkMaliciousModal";
import RemoveVoteModal from "./RemoveVoteModal";
import VetoProposalModal from "./VetoProposalModal";

const Eyebrow = ({ children }: { children: string }) => (
  <p className="font-mono text-label tracking-[0.08em] text-ink-muted uppercase">
    {children}
  </p>
);

/**
 * What the connected member can do with a proposal: vote while it runs
 * (Vote alone stands out; the wallet picker comes first without a wallet),
 * and, for its maintainers, execute it once its delay passed, remove a
 * ballot, revoke it (spam) or veto it, as quieter text actions.
 */
const ProposalActions = ({
  proposal,
  maintainers,
  onVote,
  onExecute,
}: {
  proposal: ProposalView;
  maintainers: string[];
  onVote: () => void;
  onExecute: () => void;
}) => {
  const address = useStore(connectedPublicKey);
  const [shown, setShown] = useState<
    "remove" | "revoke" | "veto" | "conflict" | null
  >(null);
  const isMaintainer = !!address && maintainers.includes(address);
  const voted = hasUserVoted(proposal.voteStatus, address);
  const isRunning =
    proposal.status === "active" && proposal.endDate * 1000 > Date.now();
  const isPending = proposal.status === "active" || proposal.status === "voted";

  const power = useQuery(
    {
      ...votingPowerQuery(proposal.projectName, address ?? ""),
      enabled: !!address && isRunning,
    },
    queryClient,
  ).data;
  // A vote can be executed once its execute delay has passed or maintainer quorum was reached.
  const delay = useQuery(
    {
      ...executeDelayQuery(proposal.projectName, proposal.id),
      enabled: isPending && isMaintainer,
    },
    queryClient,
  ).data;
  const quorumReachedAt = useQuery(
    {
      ...quorumReachedAtQuery(proposal.projectName, proposal.id),
      enabled: isPending && isMaintainer,
    },
    queryClient,
  ).data;

  const normalExecutableAt =
    delay === undefined ? undefined : (proposal.endDate + delay) * 1000;
  const earlyExecutableAt =
    delay === undefined || !quorumReachedAt
      ? undefined
      : (quorumReachedAt + Math.floor(delay / 2)) * 1000;

  const executableAt =
    normalExecutableAt === undefined
      ? undefined
      : earlyExecutableAt !== undefined
        ? Math.min(normalExecutableAt, earlyExecutableAt)
        : normalExecutableAt;

  const isEarly =
    executableAt !== undefined &&
    normalExecutableAt !== undefined &&
    executableAt < normalExecutableAt &&
    executableAt <= Date.now();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (executableAt === undefined || executableAt <= now) return;
    // Timers hold at most 2^31 - 1 ms (about 24 days).
    const wait = Math.min(executableAt - now, 2 ** 31 - 1);
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [executableAt, now]);

  const vote = async () => {
    if (!address) {
      try {
        await connect();
      } catch {
        // Closing the wallet picker is not an error.
        return;
      }
    }
    onVote();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {isRunning && (
        <Card className="flex flex-col gap-4">
          <Eyebrow>Your vote</Eyebrow>
          <Button
            size="lg"
            block
            tone={voted ? "secondary" : "primary"}
            disabled={voted}
            onClick={vote}
          >
            {voted ? "Already voted" : "Vote"}
          </Button>
          {power !== undefined && !voted && (
            <p className="figures-tabular text-small text-ink-muted">
              Your badges give you a weight of up to{" "}
              {Number(power).toLocaleString()}. A vote cannot be changed.
            </p>
          )}
          <LinkButton
            className="self-start"
            onClick={() => setShown("conflict")}
          >
            Conflict of interest
          </LinkButton>
        </Card>
      )}
      {isMaintainer && isPending && (
        <Card className="flex flex-col gap-3">
          <Eyebrow>Maintainer tools</Eyebrow>
          {executableAt !== undefined &&
            (executableAt <= now ? (
              <div className="flex flex-col gap-2">
                <Button block onClick={onExecute}>
                  Execute proposal
                </Button>
                {isEarly && normalExecutableAt !== undefined && (
                  <Notice tone="info">
                    Early execution unlocked because maintainer quorum was
                    reached. Normal execution would have been from{" "}
                    {new Date(normalExecutableAt).toLocaleString()}.
                  </Notice>
                )}
              </div>
            ) : (
              <p className="text-small text-ink-muted">
                Can be executed from {new Date(executableAt).toLocaleString()}
              </p>
            ))}
          {/* Votes can be removed until the proposal is executed. */}
          <div className="-ml-3 flex flex-wrap gap-1">
            <Button tone="ghost" size="sm" onClick={() => setShown("remove")}>
              Remove a vote
            </Button>
            <Button
              tone="danger-ghost"
              size="sm"
              onClick={() => setShown("revoke")}
            >
              Revoke proposal
            </Button>
            <Button
              tone="danger-ghost"
              size="sm"
              onClick={() => setShown("veto")}
            >
              Veto proposal
            </Button>
          </div>
          <p className="text-small text-ink-muted">
            Veto rejects a proposal whatever the votes are and keeps it on
            record. Revoke deletes spam.
          </p>
        </Card>
      )}
      {shown === "conflict" && (
        <ConflictOfInterestModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          maintainers={maintainers}
          connectedAddress={address ?? null}
          onClose={() => setShown(null)}
        />
      )}
      {shown === "remove" && (
        <RemoveVoteModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          voteStatus={proposal.voteStatus}
          onClose={() => setShown(null)}
          onRemoved={() => setShown(null)}
        />
      )}
      {shown === "veto" && (
        <VetoProposalModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          proposalTitle={proposal.title}
          onClose={() => setShown(null)}
        />
      )}
      {shown === "revoke" && (
        <MarkMaliciousModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          proposalTitle={proposal.title}
          onClose={() => setShown(null)}
          onMarked={() => setShown(null)}
        />
      )}
    </div>
  );
};

export default ProposalActions;
