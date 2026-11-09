import { useStore } from "@nanostores/react";
import { Button } from "components/ui";
import { focusRing } from "components/ui/style";
import type { ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import { proposalUrl } from "utils/urls";
import { truncateMiddle, votedOn } from "utils/utils";
import ProposalStatusBadge from "./ProposalStatusBadge";

interface Props {
  proposal: ProposalView;
  onVoteClick?: () => void;
}

/** A proposal in the list: its title links to it; Vote opens the ballot. */
const ProposalCard: React.FC<Props> = ({ proposal, onVoteClick }) => {
  const connectedAddress = useStore(connectedPublicKey);
  const userHasVoted = votedOn(proposal, connectedAddress);

  return (
    <article className="relative flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-raise hover:border-line-strong sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <a
          href={proposalUrl(proposal.projectName, proposal.id)}
          className={`text-card font-semibold text-ink no-underline after:absolute after:inset-0 after:rounded-card ${focusRing}`}
        >
          {proposal.title}
        </a>
        <span className="figures-tabular shrink-0 font-mono text-small text-ink-muted">
          #{proposal.id}
        </span>
      </div>
      <p className="text-small text-ink-muted">
        Proposed by{" "}
        <span className="font-mono">
          {truncateMiddle(proposal.proposer, 16)}
        </span>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProposalStatusBadge proposal={proposal} />
        {proposal.status == "active" && (
          <Button
            className="relative z-10"
            tone={userHasVoted ? "secondary" : "primary"}
            disabled={userHasVoted}
            onClick={() => onVoteClick?.()}
          >
            {userHasVoted ? "Already voted" : "Vote"}
          </Button>
        )}
      </div>
    </article>
  );
};

export default ProposalCard;
