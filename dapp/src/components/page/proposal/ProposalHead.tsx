import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { executeDelayQuery, proposalQuery } from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import {
  Badge,
  Button,
  Skeleton,
  Timeline,
  type TimelineStep,
} from "components/ui";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import type { ProposalView } from "types/proposal";
import { formatDateTime } from "utils/formatTimeFunctions";
import {
  memberUrl,
  projectNameFromUrl,
  projectUrl,
  proposalIdFromUrl,
} from "utils/urls";
import {
  capitalizeFirstLetter,
  modifyProposalFromContract,
  modifyProposalToView,
  truncateMiddle,
} from "utils/utils";

const when = (seconds: number) =>
  formatDateTime(new Date(seconds * 1000).toISOString());

/** A proposal's life: submitted, its vote, its execution, the outcome. */
const steps = (proposal: ProposalView, delay: number | undefined) => {
  const ended = proposal.endDate * 1000 <= Date.now();
  const executed = ["approved", "rejected", "cancelled"].includes(
    proposal.status,
  );
  const from =
    delay === undefined ? undefined : `From ${when(proposal.endDate + delay)}`;
  return [
    { label: "Submitted", state: "done" },
    {
      label: "Voting",
      detail: `${ended ? "Ended" : "Ends"} ${when(proposal.endDate)}`,
      state: ended ? "done" : "now",
    },
    {
      label: "Execute",
      detail: executed ? undefined : from,
      state: executed ? "done" : ended ? "now" : "todo",
    },
    {
      label: "Executed",
      detail: executed
        ? capitalizeFirstLetter(proposal.status)
        : "Approved, rejected or cancelled",
      state: executed ? "done" : "todo",
    },
  ] satisfies TimelineStep[];
};

/** The proposal page's head, on the band: what is proposed and where it stands. */
const ProposalHead = () => {
  const name = projectNameFromUrl();
  const id = proposalIdFromUrl();
  const isValid = Number.isInteger(id) && id >= 0 && name.length > 0;
  const proposalRead = useQuery(
    { ...proposalQuery(name, id), enabled: isValid },
    queryClient,
  );
  const raw = proposalRead.data;
  const proposal = raw
    ? modifyProposalToView(modifyProposalFromContract(raw), name)
    : null;
  const delay = useQuery(
    { ...executeDelayQuery(name, id), enabled: !!proposal },
    queryClient,
  ).data;

  const back = (
    <a
      href={name ? projectUrl(name, "proposals") : "/"}
      className="inline-flex items-center gap-1.5 self-start text-ui font-semibold text-band-muted no-underline hover:text-band-ink"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
        <path
          d="M10 3 5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {name ? `${name} · Proposals` : "Projects"}
    </a>
  );
  const head = (children: ReactNode) => (
    <div className="flex flex-col gap-4 sm:gap-5">
      {back}
      {children}
    </div>
  );
  const title =
    "text-section font-extrabold tracking-[-0.02em] break-words text-band-ink sm:text-title";

  if (isValid && proposalRead.isPending) {
    return head(
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-2/3" />
      </div>,
    );
  }
  if (isValid && proposalRead.isError && !raw) {
    return head(
      <>
        <h1 className={title}>Proposal {id}</h1>
        <p className="text-band-muted" role="alert">
          Could not load the proposal: {proposalRead.error.message}
        </p>
        <Button
          tone="secondary"
          className="self-start"
          onClick={() => proposalRead.refetch()}
        >
          Retry
        </Button>
      </>,
    );
  }
  if (!proposal) {
    return head(<h1 className={title}>Proposal not found</h1>);
  }

  return head(
    <>
      <div className="flex max-w-[760px] flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Proposal #{proposal.id}</Badge>
          <Badge>
            {proposal.publicVoting ? "Public vote" : "Anonymous vote"}
          </Badge>
        </div>
        <h1 className={title}>{proposal.title}</h1>
        <p className="text-band-muted">
          Proposed by{" "}
          <a
            href={memberUrl(proposal.proposer)}
            className="font-mono text-link underline-offset-2 hover:underline"
          >
            {truncateMiddle(proposal.proposer, 16)}
          </a>
        </p>
      </div>
      <div className="mt-2 max-w-[880px]">
        <Timeline label="Proposal" steps={steps(proposal, delay)} />
      </div>
    </>,
  );
};

export default withErrorBoundary(ProposalHead);
