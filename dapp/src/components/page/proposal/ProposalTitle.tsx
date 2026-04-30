import { useStore } from "@nanostores/react";
import Button from "components/utils/Button";
import { useState } from "react";
import type { Member } from "packages/tansu";
import type { ProposalView } from "types/proposal";
import { connectedPublicKey } from "utils/store";
import { toast, truncateMiddle } from "utils/utils";
import { getMember } from "@service/ReadContractService";
import MemberProfileModal from "components/page/dashboard/MemberProfileModal";
import ProposalStatusSection from "./ProposalStatusSection";
import VoteStatusBar from "./VoteStatusBar";
import VotingResultModal from "./VotingResultModal";
import VerifyAnonymousVotesModal from "./VerifyAnonymousVotesModal";

interface Props {
  proposal: ProposalView | null;
  maintainers: string[];
  submitVote: () => void;
  executeProposal: () => void;
}

const ProposalTitle: React.FC<Props> = ({
  proposal,
  maintainers,
  submitVote,
  executeProposal,
}) => {
  const connectedAddress = useStore(connectedPublicKey);
  const [showVotingResultModal, setShowVotingResultModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showMemberProfile, setShowMemberProfile] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

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
      const member = await getMember(proposal.proposer);
      setSelectedMember(member);
      setShowMemberProfile(true);
    } catch {
      toast.error("Member Profile", "Failed to load member profile");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const totalVotes =
    (proposal?.voteStatus?.approve?.score || 0) +
    (proposal?.voteStatus?.reject?.score || 0) +
    (proposal?.voteStatus?.abstain?.score || 0);
  const isAnonymousProposal = proposal ? !proposal.publicVoting : false;
  const isMaintainer = connectedAddress
    ? maintainers.includes(connectedAddress)
    : false;

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
                {totalVotes > 0 ? (
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
              <div className="flex gap-4 sm:gap-6">
                {proposal?.status == "active" && (
                  <Button
                    size="sm"
                    icon="/icons/vote.svg"
                    onClick={() => submitVote()}
                  >
                    Vote
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
      {showMemberProfile && proposal?.proposer && (
        <MemberProfileModal
          isOpen={showMemberProfile}
          onClose={() => setShowMemberProfile(false)}
          member={selectedMember}
          address={proposal.proposer}
        />
      )}
    </>
  );
};

export default ProposalTitle;
