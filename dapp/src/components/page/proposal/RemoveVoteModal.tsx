import { Button } from "components/ui";
import Modal from "components/utils/Modal";
import VoterInfo from "components/utils/VoterInfo";
import { useState, type FC } from "react";
import type { VoteStatus } from "types/proposal";
import { toast, truncateMiddle } from "utils/utils";
import { removeVote } from "@service/ProposalService";

interface RemoveVoteModalProps {
  projectName: string;
  proposalId: number;
  voteStatus: VoteStatus;
  onClose: () => void;
  onRemoved?: () => void;
}

const RemoveVoteModal: FC<RemoveVoteModalProps> = ({
  projectName,
  proposalId,
  voteStatus,
  onClose,
  onRemoved,
}) => {
  const [removing, setRemoving] = useState<string | null>(null);

  const voters = [
    ...voteStatus.approve.voters,
    ...voteStatus.reject.voters,
    ...voteStatus.abstain.voters,
  ];

  const handleRemove = async (voterAddress: string) => {
    setRemoving(voterAddress);
    try {
      await removeVote(projectName, proposalId, voterAddress);
      toast.success(
        "Vote removed",
        `Vote from ${truncateMiddle(voterAddress, 16)} has been removed.`,
      );
      onRemoved?.();
      onClose();
    } catch (error: any) {
      toast.error("Something went wrong", error.message);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-card font-semibold">Remove a vote</h2>
          <p className="text-small text-ink-muted">
            As a maintainer you can remove a malicious or non-compliant vote.
          </p>
        </div>

        <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
          {voters.length === 0 ? (
            <p className="text-small text-ink-muted">No votes yet.</p>
          ) : (
            voters.map((voter) => (
              <VoterInfo
                key={voter.address}
                address={voter.address}
                action={
                  <Button
                    tone="danger-ghost"
                    size="sm"
                    onClick={() => handleRemove(voter.address)}
                    loading={removing === voter.address}
                  >
                    Remove
                  </Button>
                }
              />
            ))
          )}
        </div>

        <div className="flex justify-end">
          <Button tone="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RemoveVoteModal;
