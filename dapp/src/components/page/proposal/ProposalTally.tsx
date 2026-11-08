import { useStore } from "@nanostores/react";
import { useState } from "react";
import {
  Card,
  CardHeader,
  LinkButton,
  ResultBar,
  voteShares,
} from "components/ui";
import type { ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import VerifyAnonymousVotesModal from "./VerifyAnonymousVotesModal";
import VotingResultModal from "./VotingResultModal";

const EyeIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
    <path
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);

/**
 * The vote so far, by weight, and who voted: a public vote's voters once
 * it ended; an anonymous vote's ballots, which its maintainers reveal with
 * the project's key while it runs too.
 */
const ProposalTally = ({
  proposal,
  maintainers,
}: {
  proposal: ProposalView;
  maintainers: string[];
}) => {
  const connectedAddress = useStore(connectedPublicKey);
  const [shown, setShown] = useState<"voters" | "reveal" | null>(null);
  const isMaintainer =
    !!connectedAddress && maintainers.includes(connectedAddress);
  const { approve, reject, abstain } = proposal.voteStatus;
  const voters =
    approve.voters.length + reject.voters.length + abstain.voters.length;
  const shares = voteShares(approve.score, reject.score, abstain.score);
  const isRunning = proposal.status === "active";

  const action = !proposal.publicVoting ? (
    isMaintainer ? (
      <LinkButton
        aria-label="Reveal the anonymous votes"
        onClick={() => setShown("reveal")}
      >
        <EyeIcon />
        Reveal
      </LinkButton>
    ) : undefined
  ) : voters > 0 && !isRunning ? (
    <LinkButton title="Show the voters" onClick={() => setShown("voters")}>
      <EyeIcon />
      {voters === 1 ? "1 voter" : `${voters} voters`}
    </LinkButton>
  ) : voters > 0 ? (
    <span className="text-small text-ink-muted">
      {voters === 1 ? "1 voter" : `${voters} voters`}
    </span>
  ) : undefined;

  return (
    <Card>
      <CardHeader
        title={isRunning ? "Tally so far" : "Tally"}
        action={action}
      />
      {!proposal.publicVoting ? (
        <p className="text-ink-muted">
          Anonymous vote: the tally shows once the proposal is executed.
        </p>
      ) : voters === 0 ? (
        <p className="text-ink-muted">No votes yet</p>
      ) : shares.total === 0 ? (
        <p className="text-ink-muted">No weight cast yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-4">
            {(
              [
                ["Approve", shares.approve, "bg-vote-approve"],
                ["Reject", shares.reject, "bg-vote-reject"],
                ["Abstain", shares.abstain, "bg-vote-abstain"],
              ] as const
            ).map(([label, share, dot]) => (
              <div key={label} className="flex flex-col-reverse gap-1">
                <dt className="flex items-center gap-1.5 text-small text-ink-muted">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${dot}`}
                  />
                  {label}
                </dt>
                <dd className="figures-tabular text-section font-bold">
                  {share}%
                </dd>
              </div>
            ))}
          </dl>
          <ResultBar
            approve={approve.score}
            reject={reject.score}
            abstain={abstain.score}
          />
          <p className="figures-tabular text-small text-ink-muted">
            Weighted by badges · {shares.total.toLocaleString()} cast
          </p>
        </div>
      )}
      {shown === "voters" && (
        <VotingResultModal
          projectName={proposal.projectName}
          voteStatus={proposal.voteStatus}
          status={proposal.status}
          projectMaintainers={maintainers}
          onClose={() => setShown(null)}
        />
      )}
      {shown === "reveal" && (
        <VerifyAnonymousVotesModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          onClose={() => setShown(null)}
        />
      )}
    </Card>
  );
};

export default ProposalTally;
