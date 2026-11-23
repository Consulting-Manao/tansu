import { useQuery } from "@tanstack/react-query";
import {
  ballotsExpireAt,
  executeDelayQuery,
  voteCommentsQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { Card, CardHeader } from "components/ui";
import type { ProposalView } from "types/proposal";
import { formatDate } from "utils/formatTimeFunctions";
import VoteCommentItem from "./VoteCommentItem";

/**
 * What voters wrote beside their ballots. Kept as long as the ballots, then
 * the network deletes them; shown only while some are there. A public vote
 * shows each voter's choice once it ended, as the tally shows its voters.
 */
const ProposalComments = ({ proposal }: { proposal: ProposalView }) => {
  const { projectName, id } = proposal;
  const comments = useQuery(
    voteCommentsQuery(projectName, id),
    queryClient,
  ).data;
  const delay = useQuery(executeDelayQuery(projectName, id), queryClient).data;
  if (!comments?.length) return null;

  const keptUntil = ballotsExpireAt(proposal.endDate, delay);
  const showChoices = proposal.publicVoting && proposal.status !== "active";
  const { approve, reject, abstain } = proposal.voteStatus;
  const voterOf = (address: string) =>
    [approve, reject, abstain]
      .flatMap(({ voteType, voters }) =>
        voters.map((voter) => ({ ...voter, voteType })),
      )
      .find((voter) => voter.address === address);

  return (
    <Card aria-labelledby="vote-comments">
      <CardHeader
        title={<span id="vote-comments">Comments</span>}
        action={
          <span className="text-small text-ink-muted">
            {comments.length} of {proposal.voters.length} voters
          </span>
        }
      />
      <ul className="flex flex-col">
        {comments.map(({ voter, cid }) => {
          const known = voterOf(voter);
          return (
            <VoteCommentItem
              key={voter}
              voter={voter}
              cid={cid}
              name={known?.name || undefined}
              choice={showChoices ? known?.voteType : undefined}
            />
          );
        })}
      </ul>
      {keptUntil && (
        <p className="mt-4 border-t border-line pt-3 text-small text-ink-muted">
          Comments are kept with the ballots until{" "}
          {formatDate(new Date(keptUntil).toISOString())}, then the network
          deletes them. The vote stays counted.
        </p>
      )}
    </Card>
  );
};

export default ProposalComments;
