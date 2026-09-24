import { useQueries, useQuery } from "@tanstack/react-query";
import {
  loadedProposals,
  proposalCountQuery,
  proposalQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { projectNameFromUrl } from "utils/urls";
import Loading from "components/utils/Loading";
import { useEffect, useMemo, useState } from "react";
import {
  modifyProposalFromContract,
  modifyProposalToView,
  orderProposalsForVoter,
} from "utils/utils";
import { connectedPublicKey } from "utils/store";
import { useStore } from "@nanostores/react";
import Button from "../../utils/Button";
import Pagination from "../../utils/Pagination";
import VotingModal from "../proposal/VotingModal";
import ProposalCard from "./ProposalCard";

const PROPOSALS_PER_PAGE = 18;

const ProposalList: React.FC = () => {
  const projectName = projectNameFromUrl();
  const [currentPage, setCurrentPage] = useState(0);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [proposalId, setProposalId] = useState<number>();
  const [proposalTitle, setProposalTitle] = useState<string>();
  const connectedAddress = useStore(connectedPublicKey);

  const countRead = useQuery(
    { ...proposalCountQuery(projectName), enabled: projectName.length > 0 },
    queryClient,
  );
  const count = countRead.data ?? 0;
  const totalPage = Math.max(1, Math.ceil(count / PROPOSALS_PER_PAGE));

  // Newest first: the page's ids count down from its newest one.
  const newest = count - 1 - currentPage * PROPOSALS_PER_PAGE;
  const ids = Array.from(
    { length: Math.max(0, Math.min(PROPOSALS_PER_PAGE, newest + 1)) },
    (_, index) => newest - index,
  );
  const { proposals, isLoading: isPageLoading } = useQueries(
    {
      queries: ids.map((id) => proposalQuery(projectName, id)),
      combine: loadedProposals,
    },
    queryClient,
  );

  useEffect(() => {
    setCurrentPage((previousPage) =>
      Math.min(Math.max(previousPage, 0), totalPage - 1),
    );
  }, [totalPage]);

  const handlePageChange = (page: number) => {
    if (totalPage <= 0) return;
    setCurrentPage(Math.min(Math.max(page, 0), totalPage - 1));
  };

  const isLoading = countRead.isLoading || isPageLoading;

  // `proposals` only changes with the queries' data, so re-renders from
  // elsewhere do not reshuffle the list.
  const sortedProposals = useMemo(() => {
    const views = proposals
      .map((proposal) =>
        modifyProposalToView(modifyProposalFromContract(proposal), projectName),
      )
      .filter((proposal) => proposal.status !== "malicious");
    return orderProposalsForVoter(views, connectedAddress);
  }, [proposals, connectedAddress, projectName]);

  return (
    <>
      {isLoading ? (
        <Loading />
      ) : countRead.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p>Could not load the proposals: {countRead.error.message}</p>
          <Button size="sm" onClick={() => countRead.refetch()}>
            Retry
          </Button>
        </div>
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
          onVoteSuccess={() => setShowVotingModal(false)}
          onClose={() => setShowVotingModal(false)}
        />
      )}
    </>
  );
};

export default ProposalList;
