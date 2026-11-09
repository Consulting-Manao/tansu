import { useQueries, useQuery } from "@tanstack/react-query";
import { useStore } from "@nanostores/react";
import { useMemo } from "react";
import { votingPowerQuery } from "@service/MemberService";
import {
  loaded,
  proposalCountQuery,
  proposalSummaryQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { projectNameFromUrl } from "utils/urls";
import {
  countVoterProposalStats,
  summaryToView,
  truncateMiddle,
} from "utils/utils";
import { connectedPublicKey } from "utils/store";

const ConnectedVoterSummary: React.FC = () => {
  const projectName = projectNameFromUrl();
  const connectedAddress = useStore(connectedPublicKey);
  const enabled = projectName.length > 0 && !!connectedAddress;

  // Every proposal's summary, in one ledger read; the list shares them.
  const countRead = useQuery(
    { ...proposalCountQuery(projectName), enabled },
    queryClient,
  );
  const { data: summaries, isLoading: areProposalsLoading } = useQueries(
    {
      queries: Array.from({ length: countRead.data ?? 0 }, (_, id) => ({
        ...proposalSummaryQuery(projectName, id),
        enabled,
      })),
      combine: loaded,
    },
    queryClient,
  );
  // Counts still show when the weight cannot be read.
  const { data: votingPower = 0 } = useQuery(
    { ...votingPowerQuery(projectName, connectedAddress ?? ""), enabled },
    queryClient,
  );

  const { voted, toVote } = useMemo(
    () =>
      countVoterProposalStats(
        summaries
          .map((summary) => summaryToView(summary, projectName))
          .filter((proposal) => proposal.status !== "malicious"),
        connectedAddress,
      ),
    [summaries, connectedAddress, projectName],
  );

  if (!connectedAddress || !projectName) return null;

  const isLoading = countRead.isPending || areProposalsLoading;

  return (
    <div className="flex flex-col gap-3 rounded-card bg-sunken p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <p className="font-mono text-small text-ink">
        {truncateMiddle(connectedAddress, 24)}
      </p>
      <div className="figures-tabular flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-muted">
        {isLoading ? (
          <span>Loading voter info…</span>
        ) : (
          <>
            <span>
              Voted <span className="font-semibold text-ink">{voted}</span>
            </span>
            <span>
              To vote <span className="font-semibold text-ink">{toVote}</span>
            </span>
            <span>
              Voting power{" "}
              <span className="font-semibold text-ink">
                {votingPower.toLocaleString()}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default ConnectedVoterSummary;
