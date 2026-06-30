import { useStore } from "@nanostores/react";
import {
  fetchProposalOutcomeData,
  fetchProposalFromIPFS,
} from "@service/ProposalService";
import {
  getProjectFromName,
  getProposalRaw,
} from "@service/ReadContractService";
import { useCachedQuery } from "@service/cache/cacheHooks";
import { queryKeys } from "@service/cache/cacheKeys";
import Loading from "components/utils/Loading";
import React, { useEffect, useState } from "react";
import type { Proposal as ContractProposal } from "../../../../packages/tansu";
import type { ProposalOutcome, ProposalView } from "types/proposal";
import { deriveProjectKey } from "utils/projectKey";
import { connectedPublicKey } from "utils/store";
import {
  hasUserVoted,
  modifyProposalFromContract,
  modifyProposalToView,
  toast,
} from "utils/utils";
import ExecuteProposalModal from "./ExecuteProposalModal";
import ProposalDetail from "./ProposalDetail";
import ProposalTitle from "./ProposalTitle";
import VotingModal from "./VotingModal";

const ProposalPage: React.FC = () => {
  const id = Number(new URLSearchParams(window.location.search).get("id"));
  const projectName =
    new URLSearchParams(window.location.search).get("name") || "";
  const connectedAddress = useStore(connectedPublicKey);
  const [isVotingModalOpen, setIsVotingModalOpen] = useState(false);
  const [isExecuteProposalModalOpen, setIsExecuteProposalModalOpen] =
    useState(false);
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState<ProposalOutcome | null>(null);
  const [projectMaintainers, setProjectMaintainers] = useState<string[]>([]);

  const isValidProposalId =
    Number.isInteger(id) && id >= 0 && projectName.length > 0;

  const proposalQuery = useCachedQuery({
    queryKey: queryKeys.proposal.raw(projectName, id),
    queryFn: async () => {
      if (!isValidProposalId) return null;
      return await getProposalRaw(projectName, id);
    },
    ttlMs: 60 * 60 * 1000,
    enabled: isValidProposalId,
  });

  const projectQuery = useCachedQuery({
    queryKey: queryKeys.project.byId(
      deriveProjectKey(projectName).toString("hex"),
    ),
    queryFn: async () => {
      if (!projectName) return null;
      return await getProjectFromName(projectName);
    },
    ttlMs: 4 * 60 * 60 * 1000,
    enabled: projectName.length > 0,
  });

  const rawProposal: ContractProposal | null = proposalQuery.data ?? null;
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
    const proposalData = proposalQuery.data;
    if (!proposalData) return;

    let ignore = false;

    const loadProposalDetails = async () => {
      setDescription("");
      setOutcome(null);

      if (proposalData.ipfs) {
        const fetchedDescription = await fetchProposalFromIPFS(
          proposalData.ipfs,
        );
        if (!ignore) setDescription(fetchedDescription || "");
      }

      try {
        const outcomeProposal = modifyProposalFromContract(proposalData);
        const outcomeData = await fetchProposalOutcomeData(outcomeProposal);
        if (!ignore) setOutcome(outcomeData);
      } catch {
        if (!ignore) setOutcome({});
      }
    };

    void loadProposalDetails();

    return () => {
      ignore = true;
    };
  }, [proposalQuery.data]);

  useEffect(() => {
    const projectInfo = projectQuery.data;
    if (projectInfo?.maintainers) {
      setProjectMaintainers(projectInfo.maintainers);
    }
  }, [projectQuery.data]);

  return (
    <>
      {proposalQuery.isLoading ? (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Loading />
        </div>
      ) : proposal ? (
        <div className="bg-[#FFFFFFB8] px-4 sm:px-6 md:px-[72px] py-6 sm:py-8 md:py-12 flex flex-col gap-6 sm:gap-8 md:gap-12">
          <ProposalTitle
            proposal={proposal}
            maintainers={projectMaintainers}
            submitVote={() => openVotingModal()}
            executeProposal={() => openExecuteProposalModal()}
            onProposalMarkedMalicious={() =>
              proposalQuery.refetch({ force: true })
            }
          />
          <ProposalDetail
            ipfsLink={proposal?.ipfsLink || null}
            description={description}
            outcome={outcome}
            voteStatus={proposal.voteStatus}
            status={proposal.status}
          />
          {isVotingModalOpen && (
            <VotingModal
              projectName={projectName}
              proposalId={id}
              proposalTitle={proposal?.title}
              isVoted={userHasVoted}
              onVoteSuccess={() => {
                proposalQuery.refetch({ force: true });
              }}
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

export default ProposalPage;
