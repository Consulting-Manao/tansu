import { useStore } from "@nanostores/react";
import Button from "components/utils/Button";
import { useState } from "react";
import type { ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import { hasUserVoted, toast, truncateMiddle } from "utils/utils";
import MemberProfileModal from "components/page/dashboard/MemberProfileModal";
import ConflictOfInterestModal from "./ConflictOfInterestModal";
import MarkMaliciousModal from "./MarkMaliciousModal";
import ProposalStatusSection from "./ProposalStatusSection";
import VoteStatusBar from "./VoteStatusBar";
import VotingResultModal from "./VotingResultModal";
import VerifyAnonymousVotesModal from "./VerifyAnonymousVotesModal";
import RemoveVoteModal from "./RemoveVoteModal";
import { useCachedQuery } from "@service/cache/cacheHooks";
import { queryKeys } from "@service/cache/cacheKeys";
import { getMember } from "@service/ReadContractService";

interface Props {
  proposal: ProposalView | null;
  maintainers: string[];
  submitVote: () => void;
  executeProposal: () => void;
  onProposalMarkedMalicious: () => void;
}

const ProposalTitle: React.FC<Props> = ({
  proposal,
  maintainers,
  submitVote,
  executeProposal,
  onProposalMarkedMalicious,
}) => {
  const connectedAddress = useStore(connectedPublicKey);
  const [showVotingResultModal, setShowVotingResultModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showRemoveVoteModal, setShowRemoveVoteModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showMarkMaliciousModal, setShowMarkMaliciousModal] = useState(false);
  const [showMemberProfile, setShowMemberProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const memberQuery = useCachedQuery({
    queryKey: queryKeys.membership.detail(proposal?.proposer || ""),
    queryFn: async () => {
      if (!proposal?.proposer) return null;
      return await getMember(proposal.proposer);
    },
    ttlMs: 4 * 60 * 60 * 1000,
    enabled: !!proposal?.proposer,
  });

  const openVotingResultModal = () => {
    if (proposal?.status == "active") {
      toast.error(
        "Voting Result",
        "Cannot show voters while voting is in progress",
      );
      return;
    }
    setShowVotingResultModal(true);
  };

  const openMemberProfile = async () => {
    if (!proposal?.proposer) return;

    setIsLoadingProfile(true);
    try {
      await memberQuery.refetch({ force: true });
      setShowMemberProfile(true);
    } catch {
      toast.error("Member Profile", "Failed to load member profile");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const isAnonymousProposal = proposal ? !proposal.publicVoting : false;
  const isMaintainer = connectedAddress
    ? maintainers.includes(connectedAddress)
    : false;
  const totalVoters = !isAnonymousProposal
    ? (proposal?.voteStatus?.approve?.voters?.length || 0) +
      (proposal?.voteStatus?.reject?.voters?.length || 0) +
      (proposal?.voteStatus?.abstain?.voters?.length || 0)
    : 0;
  const userHasVoted = hasUserVoted(proposal?.voteStatus, connectedAddress);

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 md:gap-[30px]">
        {proposal?.status == "active" ? (
          <img
            src="/images/box-with-coin-outside.svg"
            className="w-12 sm:w-16 md:w-auto"
          />
        ) : proposal?.status == "approved" ||
          proposal?.status == "cancelled" ||
          proposal?.status == "voted" ? (
          <img
            src="/images/box-with-coin-inside.svg"
            className="w-12 sm:w-16 md:w-auto"
          />
        ) : (
          <img src="/images/box.svg" className="w-12 sm:w-16 md:w-auto" />
        )}
        <div className="flex-grow flex flex-col gap-4 md:gap-[30px]">
          <div className="flex flex-col gap-3 md:gap-[18px]">
            <div className="flex items-center gap-3">
              <p className="leading-4 text-base text-[#695A77]">Created by</p>
              <div className="flex items-center gap-2">
                <p
                  className={`leading-4 text-base font-semibold text-primary font-mono ${
                    isLoadingProfile
                      ? "opacity-50"
                      : "cursor-pointer hover:underline"
                  }`}
                  onClick={isLoadingProfile ? undefined : openMemberProfile}
                >
                  {proposal?.proposer
                    ? truncateMiddle(proposal.proposer, 20)
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-xl sm:text-2xl font-medium text-primary break-words">
                {proposal?.id} {proposal?.title}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <VoteStatusBar
                  approve={proposal?.voteStatus?.approve?.score || 0}
                  reject={proposal?.voteStatus?.reject?.score || 0}
                  abstain={proposal?.voteStatus?.abstain?.score || 0}
                />
                {totalVoters > 0 ? (
                  <Button
                    type="secondary"
                    size="2xs"
                    icon="/icons/eye.svg"
                    onClick={openVotingResultModal}
                  />
                ) : isAnonymousProposal ? (
                  isMaintainer ? (
                    <Button
                      type="secondary"
                      size="2xs"
                      icon="/icons/eye.svg"
                      onClick={() => setShowVerifyModal(true)}
                    />
                  ) : (
                    <span className="text-sm text-secondary">
                      Anonymous voting
                    </span>
                  )
                ) : (
                  <span className="text-sm text-secondary">No votes yet</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-4 sm:gap-0">
              <ProposalStatusSection proposal={proposal} />
              <div className="flex flex-col gap-2 items-start sm:items-end">
                <div className="flex gap-3">
                  {proposal?.status == "active" && (
                    <Button
                      {...(userHasVoted ? { type: "secondary" } : {})}
                      size="sm"
                      icon={userHasVoted ? "" : "/icons/vote.svg"}
                      disabled={userHasVoted}
                      onClick={() => !userHasVoted && submitVote()}
                    >
                      {userHasVoted ? "Already Voted" : "Vote"}
                    </Button>
                  )}
                  {proposal?.status == "voted" && isMaintainer && (
                    <Button
                      size="sm"
                      icon="/icons/finalize-vote.svg"
                      onClick={() => executeProposal()}
                    >
                      Finalize Vote
                    </Button>
                  )}
                  {(proposal?.status == "active" ||
                    proposal?.status == "voted") &&
                    isMaintainer && (
                      <Button
                        size="sm"
                        type="tertiary"
                        className="border-red-500! text-red-500!"
                        onClick={() => setShowMarkMaliciousModal(true)}
                      >
                        Mark as Malicious
                      </Button>
                    )}
                </div>
                {proposal?.status == "active" && (
                  <div className="flex gap-3">
                    {isMaintainer && (
                      <Button
                        size="sm"
                        type="tertiary"
                        className="border-red-500! text-red-500!"
                        onClick={() => setShowRemoveVoteModal(true)}
                      >
                        Remove Vote
                      </Button>
                    )}
                    <Button
                      size="sm"
                      type="secondary"
                      onClick={() => setShowConflictModal(true)}
                    >
                      Conflict of Interest
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="h-[1px] bg-[#EEEEEE]" />
          </div>
        </div>
      </div>
      {showVotingResultModal && proposal?.voteStatus && (
        <VotingResultModal
          voteStatus={proposal?.voteStatus}
          status={proposal?.status}
          projectMaintainers={maintainers}
          onClose={() => setShowVotingResultModal(false)}
        />
      )}
      {showVerifyModal && proposal && (
        <VerifyAnonymousVotesModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          onClose={() => setShowVerifyModal(false)}
        />
      )}
      {showRemoveVoteModal && proposal?.voteStatus && (
        <RemoveVoteModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          voteStatus={proposal.voteStatus}
          onClose={() => setShowRemoveVoteModal(false)}
          onRemoved={() => setShowRemoveVoteModal(false)}
        />
      )}
      {showConflictModal && proposal && (
        <ConflictOfInterestModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          maintainers={maintainers}
          connectedAddress={connectedAddress ?? null}
          onClose={() => setShowConflictModal(false)}
        />
      )}
      {showMemberProfile && proposal?.proposer && (
        <MemberProfileModal
          onClose={() => setShowMemberProfile(false)}
          member={memberQuery.data ?? null}
          address={proposal.proposer}
        />
      )}
      {showMarkMaliciousModal && proposal && (
        <MarkMaliciousModal
          projectName={proposal.projectName}
          proposalId={proposal.id}
          proposalTitle={proposal.title}
          onClose={() => setShowMarkMaliciousModal(false)}
          onMarked={() => {
            setShowMarkMaliciousModal(false);
            onProposalMarkedMalicious();
          }}
        />
      )}
    </>
  );
};

export default ProposalTitle;
