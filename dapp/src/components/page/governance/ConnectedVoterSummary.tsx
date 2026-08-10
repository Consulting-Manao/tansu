import { getMemberMaxWeight } from "@service/ContractService";
import { getProposalPages, getProposals } from "@service/ReadContractService";
import { queryKeys } from "@service/cache/cacheKeys";
import { useCachedQuery } from "@service/cache/cacheHooks";
import { useStore } from "@nanostores/react";
import {
  countVoterProposalStats,
  modifyProposalToView,
  truncateMiddle,
} from "utils/utils";
import { connectedPublicKey } from "utils/store";

const TTL_4H = 4 * 60 * 60 * 1000;

const ConnectedVoterSummary: React.FC = () => {
  const projectName =
    new URLSearchParams(window.location.search).get("name") || "";
  const connectedAddress = useStore(connectedPublicKey);

  const summaryQuery = useCachedQuery({
    queryKey: queryKeys.proposals.voterSummary(
      projectName,
      connectedAddress ?? "",
    ),
    queryFn: async () => {
      if (!projectName || !connectedAddress) {
        return { voted: 0, toVote: 0, votingPower: 0 };
      }

      const contractPages = Math.max(
        1,
        (await getProposalPages(projectName)) ?? 1,
      );
      const proposals = (
        await Promise.all(
          Array.from({ length: contractPages }, (_, page) =>
            getProposals(projectName, page),
          ),
        )
      ).flatMap((pageProposals) => pageProposals ?? []);

      const views = proposals
        .map((proposal) => modifyProposalToView(proposal, projectName))
        .filter((proposal) => proposal.status !== "malicious");

      const { voted, toVote } = countVoterProposalStats(
        views,
        connectedAddress,
      );

      let votingPower: number;
      try {
        votingPower = await getMemberMaxWeight(projectName, connectedAddress);
      } catch {
        // ponytail: show counts even if weight RPC fails
        votingPower = 0;
      }

      return { voted, toVote, votingPower };
    },
    ttlMs: TTL_4H,
    enabled: projectName.length > 0 && !!connectedAddress,
  });

  if (!connectedAddress || !projectName) return null;

  const data = summaryQuery.data;
  const isLoading = summaryQuery.isLoading || data === undefined;

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
              Voted{" "}
              <span className="text-primary font-medium">{data.voted}</span>
            </span>
            <span>
              To vote{" "}
              <span className="text-primary font-medium">{data.toVote}</span>
            </span>
            <span>
              Voting power{" "}
              <span className="text-primary font-medium">
                {data.votingPower.toLocaleString()}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default ConnectedVoterSummary;
