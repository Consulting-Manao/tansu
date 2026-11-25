import { useQuery } from "@tanstack/react-query";
import { VOTE_COMMENT_FILE } from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { Badge, LinkButton, Skeleton, type BadgeTone } from "components/ui";
import Markdown from "components/utils/Markdown";
import { useState } from "react";
import { getIpfsUrl, ipfsQuery } from "utils/ipfsFunctions";
import { memberUrl } from "utils/urls";
import { truncateMiddle } from "utils/utils";

/** The most of a comment shown: what the dApp lets a voter write, twice. */
const MAX_SHOWN = 4000;

/** Longer than this, a comment starts folded to three lines. */
const FOLDED = 280;

const CHOICES: Record<string, { label: string; tone: BadgeTone }> = {
  approve: { label: "Approve", tone: "success" },
  reject: { label: "Reject", tone: "danger" },
  abstain: { label: "Abstain", tone: "warning" },
};

/**
 * One voter's comment: a `comment.md` on IPFS, uploaded once the vote
 * landed, so for a few seconds the gateway may not have it yet.
 */
const VoteCommentItem = ({
  voter,
  cid,
  name,
  choice,
}: {
  voter: string;
  cid: string;
  name: string | undefined;
  /** The voter's choice, once a public vote ended. */
  choice: string | undefined;
}) => {
  const [open, setOpen] = useState(false);
  const file = `/${VOTE_COMMENT_FILE}`;
  const read = useQuery(
    {
      ...ipfsQuery(cid, file),
      // A comment the gateway did not have is asked for again.
      staleTime: (query) => (query.state.data === null ? 0 : Infinity),
    },
    queryClient,
  );
  const text = read.data?.slice(0, MAX_SHOWN);
  const long = (text?.length ?? 0) > FOLDED;
  const shown = choice ? CHOICES[choice] : undefined;
  return (
    <li className="flex min-w-0 flex-col gap-1.5 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={memberUrl(voter)}
          className={`text-link underline-offset-2 hover:underline ${name ? "" : "font-mono"}`}
        >
          {name ? `@${name}` : truncateMiddle(voter, 16)}
        </a>
        {shown && <Badge tone={shown.tone}>{shown.label}</Badge>}
      </div>
      {read.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : read.isError ? (
        <p className="text-small text-ink-muted">
          Could not load this comment.{" "}
          <a
            href={getIpfsUrl(cid, file)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-link underline"
          >
            View on IPFS
          </a>
        </p>
      ) : text === undefined || text === null ? (
        <p className="text-small text-ink-muted">
          This comment is not on IPFS yet. It shows once its upload finishes.
        </p>
      ) : (
        <>
          <div className={long && !open ? "line-clamp-3" : undefined}>
            <Markdown>{text}</Markdown>
          </div>
          {long && (
            <LinkButton aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "Show less" : "Read more"}
            </LinkButton>
          )}
        </>
      )}
    </li>
  );
};

export default VoteCommentItem;
