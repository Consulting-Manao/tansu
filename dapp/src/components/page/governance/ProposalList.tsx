import { useQueries, useQuery } from "@tanstack/react-query";
import {
  loaded,
  proposalCountQuery,
  proposalSummaryQuery,
} from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { projectNameFromUrl } from "utils/urls";
import { Button, EmptyState, Loading, Notice, Pagination } from "components/ui";
import { useEffect, useMemo, useState } from "react";
import { orderProposalsForVoter, summaryToView } from "utils/utils";
import { connectedPublicKey } from "utils/store";
import { useStore } from "@nanostores/react";
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
  const { data: summaries, isLoading: isPageLoading } = useQueries(
    {
      queries: ids.map((id) => proposalSummaryQuery(projectName, id)),
      combine: loaded,
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

  const sortedProposals = useMemo(
    () =>
      orderProposalsForVoter(
        summaries
          .map((summary) => summaryToView(summary, projectName))
          .filter((proposal) => proposal.status !== "malicious"),
        connectedAddress,
      ),
    [summaries, connectedAddress, projectName],
  );

  return (
    <>
      {isLoading ? (
        <Loading />
      ) : countRead.isError ? (
        <Notice tone="danger">
          <div className="flex flex-col items-start gap-3">
            <p>Could not load the proposals: {countRead.error.message}</p>
            <Button
              size="sm"
              tone="secondary"
              onClick={() => countRead.refetch()}
            >
              Retry
            </Button>
          </div>
        </Notice>
      ) : sortedProposals.length === 0 && totalPage <= 1 ? (
        <EmptyState
          image="/images/box-with-coin-outside.svg"
          title="No proposals yet"
        >
          A maintainer’s proposal shows here, and its vote runs here.
        </EmptyState>
      ) : (
        <div className="flex w-full flex-col gap-8">
          <div className="flex flex-col gap-4">
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
          onClose={() => setShowVotingModal(false)}
        />
      )}
    </>
  );
};

export default ProposalList;
