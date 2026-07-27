import { getProposalPages, getProposals } from "@service/ReadContractService";
import Loading from "components/utils/Loading";
import { useEffect, useMemo, useState } from "react";
import { hasUserVoted, modifyProposalToView } from "utils/utils";
import { connectedPublicKey } from "utils/store";
import { useStore } from "@nanostores/react";
import Pagination from "../../utils/Pagination";
import VotingModal from "../proposal/VotingModal";
import ProposalCard from "./ProposalCard";
import { queryKeys } from "@service/cache/cacheKeys";
import { useCachedQuery } from "@service/cache/cacheHooks";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

const ProposalList: React.FC = () => {
  const projectName =
    new URLSearchParams(window.location.search).get("name") || "";
  const [currentPage, setCurrentPage] = useState(0);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [proposalId, setProposalId] = useState<number>();
  const [proposalTitle, setProposalTitle] = useState<string>();
  const connectedAddress = useStore(connectedPublicKey);

  const proposalPagesQuery = useCachedQuery({
    queryKey: queryKeys.proposals.pages(projectName),
    queryFn: async () => {
      if (!projectName) return 1;
      return Math.max(1, (await getProposalPages(projectName)) ?? 1);
    },
    ttlMs: 4 * 60 * 60 * 1000,
  });

  const contractTotalPage = Math.max(1, proposalPagesQuery.data ?? 1);
  const totalPage = Math.max(1, Math.ceil(contractTotalPage / 2));

  const proposalDataQuery = useCachedQuery({
    queryKey: queryKeys.proposals.list(projectName, currentPage),
    queryFn: async () => {
      if (!projectName) return [];

      const latestContractPage = contractTotalPage - 1 - currentPage * 2;
      const contractPagesToFetch = [
        latestContractPage,
        latestContractPage - 1,
      ].filter((page) => page >= 0);

      const proposals = (
        await Promise.all(
          contractPagesToFetch.map((page) => getProposals(projectName, page)),
        )
      ).flatMap((pageProposals) => pageProposals ?? []);

      return proposals;
    },
    ttlMs: 4 * 60 * 60 * 1000,
    enabled: projectName.length > 0 && proposalPagesQuery.data !== undefined,
  });

  // Compute ProposalView on every render so modifyProposalStatusToView uses
  // current time (new Date()) — matching how ProposalPage.tsx does it.
  // This ensures proposals whose voting period ended since the last cache
  // are correctly shown as "pending execution".
  const rawProposals = proposalDataQuery.data ?? [];
  const proposalViews = rawProposals
    .map((proposal) => modifyProposalToView(proposal, projectName))
    .filter((proposal) => proposal.status !== "malicious");

  useEffect(() => {
    setCurrentPage((previousPage) =>
      Math.min(Math.max(previousPage, 0), totalPage - 1),
    );
  }, [totalPage]);

  const handlePageChange = (page: number) => {
    if (totalPage <= 0) return;
    setCurrentPage(Math.min(Math.max(page, 0), totalPage - 1));
  };

  const isLoading =
    proposalPagesQuery.isLoading ||
    proposalPagesQuery.data === undefined ||
    proposalDataQuery.isLoading;

  // For logged-in users: active+unvoted proposals (randomized) first, then rest sorted by newest
  // For logged-out users: normal sort (newest first, no shuffle)
  const sortedProposals = useMemo(() => {
    if (connectedAddress) {
      const activeUnvoted = proposalViews.filter(
        (p) =>
          p.status === "active" &&
          !hasUserVoted(p.voteStatus, connectedAddress),
      );
      const rest = proposalViews.filter(
        (p) =>
          p.status !== "active" || hasUserVoted(p.voteStatus, connectedAddress),
      );
      return [
        ...shuffleArray(activeUnvoted),
        ...rest.sort((a, b) => b.id - a.id),
      ];
    }
    return [...proposalViews].sort((a, b) => b.id - a.id);
  }, [proposalViews, connectedAddress]);

  return (
    <>
      {isLoading ? (
        <Loading />
      ) : (
        <div className="w-full flex flex-col gap-12">
          <div className="flex flex-col gap-[18px]">
            {sortedProposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onVoteClick={() => {
                  setProposalId(proposal.id);
                  setProposalTitle(proposal.title);
                  setShowVotingModal(true);
                }}
              />
            ))}
          </div>
          <Pagination
            totalPage={totalPage}
            currentPage={currentPage + 1}
            onPageChange={(page: number) => handlePageChange(page - 1)}
          />
        </div>
      )}
      {showVotingModal && (
        <VotingModal
          projectName={projectName}
          proposalId={proposalId}
          proposalTitle={proposalTitle}
          onVoteSuccess={() => {
            proposalDataQuery.refetch({ force: true });
            setShowVotingModal(false);
          }}
          onClose={() => setShowVotingModal(false)}
        />
      )}
    </>
  );
};

export default ProposalList;
