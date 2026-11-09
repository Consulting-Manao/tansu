import { useQueries, useQuery } from "@tanstack/react-query";
import {
  loaded,
  proposalCountQuery,
  proposalSummaryQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { Card, CardHeader, Skeleton } from "components/ui";
import { proposalUrl } from "utils/urls";
import { summaryToView } from "utils/utils";
import ProposalStatusBadge from "./ProposalStatusBadge";

const SHOWN = 3;

/** The project's newest proposals, for its overview: three reads at most. */
const RecentProposals = ({
  name,
  action,
}: {
  name: string;
  /** The way to all of them. */
  action: React.ReactNode;
}) => {
  const countRead = useQuery(proposalCountQuery(name), queryClient);
  const count = countRead.data ?? 0;
  const ids = Array.from(
    { length: Math.min(SHOWN, count) },
    (_, index) => count - 1 - index,
  );
  const { data: summaries, isLoading } = useQueries(
    {
      queries: ids.map((id) => proposalSummaryQuery(name, id)),
      combine: loaded,
    },
    queryClient,
  );
  const views = summaries
    .map((summary) => summaryToView(summary, name))
    .filter((proposal) => proposal.status !== "malicious");

  return (
    <Card>
      <CardHeader title="Recent proposals" action={count > 0 && action} />
      {countRead.isPending || isLoading ? (
        <Skeleton className="h-5 w-2/3" />
      ) : views.length === 0 ? (
        <p className="text-ink-muted">No proposals yet.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {views.map((proposal) => (
            <li key={proposal.id}>
              <a
                href={proposalUrl(name, proposal.id)}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-control p-2 text-ink no-underline hover:bg-sunken"
              >
                <span className="min-w-0 font-semibold">{proposal.title}</span>
                <ProposalStatusBadge proposal={proposal} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default RecentProposals;
