import { MAX_VOTE_COMMENT } from "@service/ProposalService";
import { Notice, Textarea } from "components/ui";
import { formatDate } from "utils/formatTimeFunctions";

/**
 * The optional comment of a vote. It is public under the voter's address,
 * also when their choice is encrypted, and lives as long as the ballot.
 */
const VoteCommentField = ({
  value,
  onChange,
  anonymous,
  keptUntil,
}: {
  value: string;
  onChange: (value: string) => void;
  anonymous: boolean;
  /** When the ballots are deleted, in ms. */
  keptUntil: number | undefined;
}) => (
  <div className="flex flex-col gap-3">
    <Textarea
      label={
        <>
          Explain your vote{" "}
          <span className="font-normal text-ink-muted">(optional)</span>
        </>
      }
      hint={`Markdown. Public, beside your vote, until ${
        keptUntil ? formatDate(new Date(keptUntil).toISOString()) : "…"
      }: 14 days after the proposal can execute. ${value.length.toLocaleString()} / ${MAX_VOTE_COMMENT.toLocaleString()}`}
      error={
        value.length > MAX_VOTE_COMMENT
          ? `Keep the comment under ${MAX_VOTE_COMMENT.toLocaleString()} characters.`
          : undefined
      }
      rows={4}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
    {anonymous && value.trim() && (
      <Notice tone="warning">
        Your choice is encrypted, your comment is not. It is public under your
        address and can tell how you voted.
      </Notice>
    )}
  </div>
);

export default VoteCommentField;
