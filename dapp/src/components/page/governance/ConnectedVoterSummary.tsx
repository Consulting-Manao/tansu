import { useQueries, useQuery } from "@tanstack/react-query";
import { useStore } from "@nanostores/react";
import { useMemo } from "react";
import { votingPowerQuery } from "@service/MemberService";
import {
  loadedProposals,
  proposalCountQuery,
  proposalQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { projectNameFromUrl } from "utils/urls";
import {
  countVoterProposalStats,
  modifyProposalFromContract,
  modifyProposalToView,
  truncateMiddle,
} from "utils/utils";
import { connectedPublicKey } from "utils/store";

const ConnectedVoterSummary: React.FC = () => {
  const projectName = projectNameFromUrl();
  const connectedAddress = useStore(connectedPublicKey);
  const enabled = projectName.length > 0 && !!connectedAddress;

  // The same queries as the list: every proposal, loaded once.
  const countRead = useQuery(
    { ...proposalCountQuery(projectName), enabled },
    queryClient,
  );
  const { proposals, isLoading: areProposalsLoading } = useQueries(
    {
      queries: Array.from({ length: countRead.data ?? 0 }, (_, id) => ({
        ...proposalQuery(projectName, id),
        enabled,
      })),
      combine: loadedProposals,
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
        proposals
          .map((proposal) =>
            modifyProposalToView(
              modifyProposalFromContract(proposal),
              projectName,
            ),
          )
          .filter((proposal) => proposal.status !== "malicious"),
        connectedAddress,
      ),
    [proposals, connectedAddress, projectName],
  );

  if (!connectedAddress || !projectName) return null;

  const isLoading = countRead.isPending || areProposalsLoading;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-[#F5F1F9]">
      <p className="font-mono text-sm text-primary">
        {truncateMiddle(connectedAddress, 24)}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary">
        {isLoading ? (
          <span>Loading voter info…</span>
        ) : (
          <>
            <span>
              Voted <span className="text-primary font-medium">{voted}</span>
            </span>
            <span>
              To vote <span className="text-primary font-medium">{toVote}</span>
            </span>
            <span>
              Voting power{" "}
              <span className="text-primary font-medium">
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
