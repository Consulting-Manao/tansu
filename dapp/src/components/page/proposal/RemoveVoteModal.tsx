import Button from "components/utils/Button";
import Modal from "components/utils/Modal";
import { useState, type FC } from "react";
import type { VoteStatus } from "types/proposal";
import { VoteType } from "types/proposal";
import { truncateMiddle, toast } from "utils/utils";
import { removeVoteFlow } from "@service/FlowService";
import { votedTypeLabelMap } from "constants/constants";

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
  const [currentType, setCurrentType] = useState<VoteType>(VoteType.APPROVE);
  const [removing, setRemoving] = useState<string | null>(null);

  const voters = voteStatus[currentType].voters;

  const handleRemove = async (voterAddress: string) => {
    setRemoving(voterAddress);
    try {
      await removeVoteFlow({ projectName, proposalId, voterAddress });
      toast.success(
        "Vote Removed",
        `Vote from ${truncateMiddle(voterAddress, 16)} has been removed and collateral slashed.`,
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
          <p className="text-xl font-medium text-primary">Remove a Vote</p>
          <p className="text-sm text-secondary">
            As a maintainer you can remove a malicious or non-compliant vote.
            The voter's collateral will be slashed.
          </p>
        </div>

        <div className="flex">
          {[VoteType.APPROVE, VoteType.REJECT, VoteType.CANCEL].map(
            (type, index) => (
              <button
                key={index}
                className={`p-[6px_12px] ${type === currentType && "bg-[#FFBD1E]"} border border-[#FFBD1E]`}
                onClick={() => setCurrentType(type)}
              >
                <p className="leading-4 text-base font-medium text-primary">
                  {votedTypeLabelMap[type]} Votes
                </p>
              </button>
            ),
          )}
        </div>

        <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
          {voters.length === 0 ? (
            <p className="text-sm text-secondary italic">
              No votes in this category.
            </p>
          ) : (
            voters.map((voter) => (
              <div
                key={voter.address}
                className="flex items-center justify-between gap-4 p-3 border border-[#EEEEEE] rounded"
              >
                <div className="flex flex-col gap-1">
                  {voter.name && (
                    <p className="text-sm font-medium text-primary">
                      @{voter.name}
                    </p>
                  )}
                  <p className="text-xs text-secondary font-mono">
                    {truncateMiddle(voter.address, 20)}
                  </p>
                </div>
                <Button
                  type="tertiary"
                  size="xs"
                  className="!border-red-500 !text-red-500"
                  onClick={() => handleRemove(voter.address)}
                  disabled={removing === voter.address}
                >
                  {removing === voter.address ? "Removing…" : "Remove"}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <Button type="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RemoveVoteModal;
