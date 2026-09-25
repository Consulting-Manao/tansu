import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchProposalOutcomeData,
  fetchProposalFromIPFS,
  fetchProposalDiscussionFromIPFS,
  fetchProposalDiscussionSummaryFromIPFS,
  proposalQuery,
  resolveDiscussionCid,
} from "@service/ProposalService";
import { projectQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { projectNameFromUrl } from "utils/urls";
import Button from "components/utils/Button";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import Loading from "components/utils/Loading";
import React, { useEffect, useState } from "react";
import type { ProposalOutcome, ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import {
  hasUserVoted,
  modifyProposalFromContract,
  modifyProposalToView,
  toast,
} from "utils/utils";
import DiscussionSection from "./DiscussionSection";
import ExecuteProposalModal from "./ExecuteProposalModal";
import ProposalDetail from "./ProposalDetail";
import ProposalTitle from "./ProposalTitle";
import VotingModal from "./VotingModal";

const ProposalPage: React.FC = () => {
  const id = Number(new URLSearchParams(window.location.search).get("id"));
  const projectName = projectNameFromUrl();
  const connectedAddress = useStore(connectedPublicKey);
  const [isVotingModalOpen, setIsVotingModalOpen] = useState(false);
  const [isExecuteProposalModalOpen, setIsExecuteProposalModalOpen] =
    useState(false);
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState<ProposalOutcome | null>(null);
  const [discussion, setDiscussion] = useState<string | null>(null);
  const [discussionSummary, setDiscussionSummary] = useState<string | null>(
    null,
  );
  const [discussionCid, setDiscussionCid] = useState<string | null>(null);
  const [isDiscussionLoading, setIsDiscussionLoading] = useState(false);

  const isValidProposalId =
    Number.isInteger(id) && id >= 0 && projectName.length > 0;

  const proposalRead = useQuery(
    { ...proposalQuery(projectName, id), enabled: isValidProposalId },
    queryClient,
  );
  const projectRead = useQuery(
    { ...projectQuery(projectName), enabled: projectName.length > 0 },
    queryClient,
  );
  const projectMaintainers = projectRead.data?.maintainers ?? [];

  const rawProposal = proposalRead.data ?? null;
  const appProposal = rawProposal
    ? modifyProposalFromContract(rawProposal)
    : null;
  const proposal: ProposalView | null = appProposal
    ? modifyProposalToView(appProposal, projectName)
    : null;
  const userHasVoted = hasUserVoted(appProposal?.voteStatus, connectedAddress);

  const openVotingModal = () => {
    if (proposal?.status === "active") {
      if (connectedAddress) {
        setIsVotingModalOpen(true);
      } else {
        toast.error("Connect Wallet", "Please connect your wallet first.");
      }
    }
  };

  const openExecuteProposalModal = () => {
    if (proposal?.status === "voted") {
      setIsExecuteProposalModalOpen(true);
    } else {
      toast.error("Execute Proposal", "Cannot execute proposal.");
    }
  };

  useEffect(() => {
    if (!isValidProposalId) {
      toast.error(
        "Something Went Wrong!",
        "Project name or proposal id is not provided",
      );
    }
  }, [id, projectName, isValidProposalId]);

  useEffect(() => {
    const proposalData = proposalRead.data;
    if (!proposalData) return;

    let ignore = false;

    const loadProposalDetails = async () => {
      setDescription("");
      setOutcome(null);
      setDiscussion(null);
      setDiscussionSummary(null);
      setDiscussionCid(null);

      const appProposal = modifyProposalFromContract(proposalData);

      if (proposalData.ipfs) {
        const fetchedDescription = await fetchProposalFromIPFS(
          proposalData.ipfs,
        );
        if (!ignore) setDescription(fetchedDescription || "");
      }

      try {
        const outcomeData = await fetchProposalOutcomeData(appProposal);
        if (!ignore) setOutcome(outcomeData);
      } catch {
        if (!ignore) setOutcome({});
      }

      const cid = resolveDiscussionCid(appProposal);
      if (cid) {
        if (!ignore) {
          setDiscussionCid(cid);
          setIsDiscussionLoading(true);
        }
        const [thread, summary] = await Promise.all([
          fetchProposalDiscussionFromIPFS(cid),
          fetchProposalDiscussionSummaryFromIPFS(cid),
        ]);
        if (!ignore) {
          setDiscussion(thread);
          setDiscussionSummary(summary);
          setIsDiscussionLoading(false);
        }
      }
    };

    void loadProposalDetails();

    return () => {
      ignore = true;
    };
  }, [proposalRead.data]);

  return (
    <>
      {proposalRead.isLoading ? (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Loading />
        </div>
      ) : proposalRead.isError && !proposalRead.data ? (
        <div className="flex flex-col items-start gap-3">
          <p>Could not load the proposal: {proposalRead.error.message}</p>
          <Button size="sm" onClick={() => proposalRead.refetch()}>
            Retry
          </Button>
        </div>
      ) : proposal ? (
        <div className="bg-[#FFFFFFB8] px-4 sm:px-6 md:px-[72px] py-6 sm:py-8 md:py-12 flex flex-col gap-6 sm:gap-8 md:gap-12">
          <ProposalTitle
            proposal={proposal}
            maintainers={projectMaintainers}
            submitVote={() => openVotingModal()}
            executeProposal={() => openExecuteProposalModal()}
          />
          <ProposalDetail
            ipfsLink={proposal?.ipfsLink || null}
            description={description}
            outcome={outcome}
            voteStatus={proposal.voteStatus}
            status={proposal.status}
          />
          <DiscussionSection
            discussion={discussion}
            summary={discussionSummary}
            isLoading={isDiscussionLoading}
            ipfsCid={discussionCid}
          />
          {isVotingModalOpen && (
            <VotingModal
              projectName={projectName}
              proposalId={id}
              proposalTitle={proposal?.title}
              isVoted={userHasVoted}
              onClose={() => setIsVotingModalOpen(false)}
            />
          )}
          {isExecuteProposalModalOpen && (
            <ExecuteProposalModal
              projectName={projectName}
              proposalId={id}
              proposal={appProposal || undefined}
              outcome={outcome}
              voteStatus={proposal?.voteStatus}
              onClose={() => setIsExecuteProposalModalOpen(false)}
            />
          )}
        </div>
      ) : (
        <div>Proposal not found</div>
      )}
    </>
  );
};

export default withErrorBoundary(ProposalPage);
