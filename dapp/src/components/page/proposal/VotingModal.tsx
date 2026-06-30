import Button from "components/utils/Button";
import Modal, { type ModalProps } from "components/utils/Modal";
import Title from "components/utils/Title";
import { voteTypeDescriptionMap, voteTypeLabelMap } from "constants/constants";
import { useState, useEffect } from "react";
import { VoteType } from "types/proposal";
import VoteTypeCheckbox from "./VoteTypeCheckbox";
import { loadedPublicKey } from "../../../service/walletService";
import { getVotingPower } from "../../../service/ContractService";
import { parseContractError } from "../../../utils/contractErrors";
import { toast } from "../../../utils/utils";

interface VotersModalProps extends ModalProps {
  projectName: string;
  proposalId: number | undefined;
  proposalTitle: string | undefined;
  isVoted?: boolean;
  onVoteSuccess?: () => void;
  onClose: () => void;
}

const VotingModal: React.FC<VotersModalProps> = ({
  projectName,
  proposalId,
  proposalTitle,
  isVoted,
  onVoteSuccess,
  onClose,
}) => {
  const [selectedOption, setSelectedOption] = useState<VoteType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [maxWeight, setMaxWeight] = useState<number>(0);
  const [selectedWeight, setSelectedWeight] = useState<number>(0);
  const [isTokenVoting, setIsTokenVoting] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const isInsufficientVotingPower = maxWeight <= 0;

  const insufficientPowerMessage = isTokenVoting
    ? "You don't have any balance of the voting token to cast a vote."
    : "You don't have the required minimal voting power to cast a vote.";

  const votingPowerLabel = isTokenVoting
    ? `${selectedWeight.toLocaleString()} / ${tokenBalance.toLocaleString()} tokens`
    : `${selectedWeight.toLocaleString()} / ${maxWeight.toLocaleString()}`;

  useEffect(() => {
    let ignore = false;

    const fetchVotingPower = async () => {
      try {
        const publicKey = loadedPublicKey();
        if (!publicKey || proposalId === undefined) return;

        const power = await getVotingPower(projectName, proposalId, publicKey);

        if (!ignore) {
          setIsTokenVoting(power.isTokenVoting);
          setMaxWeight(power.maxWeight);
          setSelectedWeight(power.maxWeight);
          setTokenBalance(power.isTokenVoting ? (power.tokenBalance ?? 0) : 0);
          if (power.maxWeight <= 0) {
            setVoteError(insufficientPowerMessage);
          } else {
            setVoteError(null);
          }
        }
      } catch (err) {
        if (!ignore) {
          setMaxWeight(0);
          setSelectedWeight(0);
          setTokenBalance(0);
          setIsTokenVoting(false);
          setVoteError(
            err instanceof Error
              ? parseContractError(err)
              : "Failed to load voting power. Check your wallet and token contract.",
          );
        }
      }
    };

    fetchVotingPower();

    return () => {
      ignore = true;
    };
  }, [projectName, proposalId]);

  const validateVote = (): boolean => {
    if (isInsufficientVotingPower) {
      setVoteError(insufficientPowerMessage);
      return false;
    }

    if (!selectedOption) {
      setVoteError("You must select one option to vote");
      return false;
    }

    if (isVoted) {
      setVoteError("You have already voted");
      return false;
    }

    if (proposalId === undefined) {
      setVoteError("Proposal ID is required");
      return false;
    }

    setVoteError(null);
    return true;
  };

  const votingPowerPercentage =
    maxWeight > 0 ? Math.round((selectedWeight / maxWeight) * 100) : 0;

  const handleVote = async () => {
    if (!validateVote()) return;

    setIsLoading(true);
    const { voteToProposal } = await import("@service/ContractService");

    try {
      await voteToProposal(
        projectName,
        proposalId!,
        selectedOption as VoteType,
        selectedWeight,
      );
      onVoteSuccess?.();
      toast.success(
        "Congratulations!",
        "Your vote was submitted successfully.",
      );
      onClose();
    } catch (error: any) {
      let errorMessage = "Failed to cast vote";

      if (typeof error === "string") {
        errorMessage += `: ${error}`;
      } else if (error?.message) {
        errorMessage += `: ${error.message}`;
      } else if (error?.code === 4001) {
        errorMessage += ": The transaction was cancelled by the user";
      } else {
        errorMessage += `: ${JSON.stringify(error)}`;
      }

      setVoteError(errorMessage);
      return;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-9">
        <img
          src="/images/box-with-coin-outside.svg"
          className="w-40 sm:w-60 md:w-80 lg:w-[360px] h-auto"
          alt=""
        />
        <div className="flex-grow flex flex-col gap-6 sm:gap-9 w-full">
          <Title
            title="Cast Your Vote"
            description={
              <div className="flex flex-wrap gap-1.5">
                <p>Vote on the proposal:</p>
                <p className="font-bold text-primary">{proposalTitle}</p>
              </div>
            }
          />
          {[VoteType.APPROVE, VoteType.REJECT, VoteType.CANCEL].map(
            (voteType, index) => (
              <div
                key={index}
                className="flex gap-3 cursor-pointer"
                onClick={() => {
                  setSelectedOption(voteType);
                  setVoteError(null);
                }}
              >
                <VoteTypeCheckbox
                  voteType={voteType}
                  currentVoteType={selectedOption}
                />
                <div className="flex flex-col justify-center gap-2">
                  <p
                    className={`leading-5 text-lg sm:text-xl font-medium text-${voteType}`}
                  >
                    {voteTypeLabelMap[voteType]}
                  </p>
                  <p className="leading-4 text-sm sm:text-base font-semibold text-primary">
                    {voteTypeDescriptionMap[voteType]}
                  </p>
                </div>
              </div>
            ),
          )}
          {voteError && (
            <div className="bg-red-50 border border-red-200 text-red-500 px-4 py-2 rounded">
              {voteError}
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-primary">
                Voting Power: {votingPowerLabel}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={votingPowerPercentage}
                disabled={isInsufficientVotingPower}
                onChange={(e) => {
                  const percentage = Number(e.target.value);
                  if (maxWeight <= 0) {
                    setSelectedWeight(0);
                    return;
                  }
                  setSelectedWeight(Math.round((percentage / 100) * maxWeight));
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary"
                style={{
                  background: `linear-gradient(to right, #7c3aed 0%, #7c3aed ${votingPowerPercentage}%, #e5e7eb ${votingPowerPercentage}%, #e5e7eb 100%)`,
                }}
              />
              {isInsufficientVotingPower ? (
                <p className="text-xs text-red-500">
                  {insufficientPowerMessage}
                </p>
              ) : (
                <p className="text-xs text-secondary">
                  {isTokenVoting
                    ? "Slide to adjust how many tokens to commit as vote weight"
                    : "Slide to adjust your voting power"}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-4">
            <div className="flex gap-3">
              <Button type="secondary" onClick={onClose}>
                Close
              </Button>
              <Button
                isLoading={isLoading}
                disabled={isInsufficientVotingPower}
                onClick={() => !isLoading && handleVote()}
              >
                Vote
              </Button>
            </div>
            <p className="text-sm sm:text-base text-secondary text-right">
              Once submitted, your vote cannot be changed.
            </p>
            <p className="px-3 py-1 text-sm sm:text-base bg-[#F5F1F9] text-primary">
              {isTokenVoting ? (
                <>
                  ℹ️ Token-based voting locks {selectedWeight.toLocaleString()}{" "}
                  token
                  {selectedWeight === 1 ? "" : "s"} as collateral. This amount
                  is refunded when the vote is executed.
                </>
              ) : (
                <>
                  ℹ️ Casting a vote requires a 2 XLM collateral. This collateral
                  is refunded when the vote is executed
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default VotingModal;
