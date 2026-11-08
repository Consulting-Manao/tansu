import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { votingPowerQuery } from "@service/MemberService";
import { executeDelayQuery } from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { connect } from "@service/walletService";
import { Button, Card } from "components/ui";
import type { ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import { hasUserVoted } from "utils/utils";
import ConflictOfInterestModal from "./ConflictOfInterestModal";
import MarkMaliciousModal from "./MarkMaliciousModal";
import RemoveVoteModal from "./RemoveVoteModal";

const Eyebrow = ({ children }: { children: string }) => (
  <p className="font-mono text-label tracking-[0.08em] text-ink-muted uppercase">
    {children}
  </p>
);

/**
 * What the connected member can do with a proposal: vote while it runs
 * (Vote alone stands out; the wallet picker comes first without a wallet),
 * and, for its maintainers, execute it once its delay passed, remove a
 * ballot, or revoke it, as quieter text actions.
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
  const [shown, setShown] = useState<"remove" | "revoke" | "conflict" | null>(
    null,
  );
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
  // A vote can be executed once its execute delay has passed too.
  const delay = useQuery(
    {
      ...executeDelayQuery(proposal.projectName, proposal.id),
      enabled: proposal.status === "voted" && isMaintainer,
    },
    queryClient,
  ).data;
  const executableAt =
    delay === undefined ? undefined : (proposal.endDate + delay) * 1000;
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
          <button
            type="button"
            onClick={() => setShown("conflict")}
            className="self-start text-small font-semibold text-link underline-offset-2 hover:underline"
          >
            Conflict of interest
          </button>
        </Card>
      )}
      {isMaintainer && isPending && (
        <Card className="flex flex-col gap-3">
          <Eyebrow>Maintainer tools</Eyebrow>
          {proposal.status === "voted" &&
            executableAt !== undefined &&
            (executableAt <= now ? (
              <Button block onClick={onExecute}>
                Execute proposal
              </Button>
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
          </div>
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
