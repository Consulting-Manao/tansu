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
import { projectNameFromUrl, proposalIdFromUrl } from "utils/urls";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import { Loading } from "components/ui";
import React, { useEffect, useState } from "react";
import type { ProposalOutcome, ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import {
  hasUserVoted,
  modifyProposalFromContract,
  modifyProposalToView,
} from "utils/utils";
import DiscussionSection from "./DiscussionSection";
import ExecuteProposalModal from "./ExecuteProposalModal";
import ProposalDetail from "./ProposalDetail";
import ProposalActions from "./ProposalActions";
import ProposalTally from "./ProposalTally";
import VotingModal from "./VotingModal";

const ProposalPage: React.FC = () => {
  const id = proposalIdFromUrl();
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

  // The head says when there is no such proposal or it could not be read.
  if (proposalRead.isLoading) return <Loading />;
  if (!proposal) return null;

  return (
    <div className="mx-auto grid w-full max-w-[1120px] gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10">
      <div className="flex min-w-0 flex-col gap-6">
        <ProposalTally proposal={proposal} maintainers={projectMaintainers} />
        <ProposalDetail
          ipfsLink={proposal.ipfsLink || null}
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
      </div>
      <div className="lg:order-none order-first">
        <ProposalActions
          proposal={proposal}
          maintainers={projectMaintainers}
          onVote={() => setIsVotingModalOpen(true)}
          onExecute={() => setIsExecuteProposalModalOpen(true)}
        />
      </div>
      {isVotingModalOpen && (
        <VotingModal
          projectName={projectName}
          proposalId={id}
          proposalTitle={proposal.title}
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
          voteStatus={proposal.voteStatus}
          onClose={() => setIsExecuteProposalModalOpen(false)}
        />
      )}
    </div>
  );
};

export default withErrorBoundary(ProposalPage);
