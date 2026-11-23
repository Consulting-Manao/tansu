import { voteTypeDescriptionMap, voteTypeLabelMap } from "constants/constants";
import { useState, useEffect } from "react";
import { VoteType } from "types/proposal";
import { loadedPublicKey } from "../../../service/walletService";
import { useQuery } from "@tanstack/react-query";
import {
  ballotsExpireAt,
  executeDelayQuery,
  getVotingPower,
  MAX_VOTE_COMMENT,
  proposalSummaryQuery,
  vote,
} from "../../../service/ProposalService";
import { queryClient } from "../../../service/queryClient";
import type { LandedUploadError } from "../../../service/TxService";
import VoteCommentField from "./VoteCommentField";
import VoteReceiptView from "./VoteReceiptView";
import { errorMessage } from "../../../utils/contractErrors";
import { toast } from "../../../utils/utils";
import {
  Button,
  Dialog,
  flowSteps,
  RadioGroup,
  Stepper,
  Title,
  useFlow,
} from "components/ui";

interface VotersModalProps {
  projectName: string;
  proposalId: number | undefined;
  proposalTitle: string | undefined;
  isVoted?: boolean;
  onClose: () => void;
}

const VotingModal: React.FC<VotersModalProps> = ({
  projectName,
  proposalId,
  proposalTitle,
  isVoted,
  onClose,
}) => {
  const [selectedOption, setSelectedOption] = useState<VoteType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [maxWeight, setMaxWeight] = useState<number>(0);
  const [selectedWeight, setSelectedWeight] = useState<number>(0);
  const [isTokenVoting, setIsTokenVoting] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [voteReceipt, setVoteReceipt] = useState<
    import("types/proposal").VoteReceipt | null
  >(null);
  const [unuploaded, setUnuploaded] = useState<LandedUploadError>();
  const [comment, setComment] = useState("");
  const flow = useFlow();
  const summary = useQuery(
    {
      ...proposalSummaryQuery(projectName, proposalId ?? 0),
      enabled: proposalId !== undefined,
    },
    queryClient,
  ).data?.proposal;
  const delay = useQuery(
    {
      ...executeDelayQuery(projectName, proposalId ?? 0),
      enabled: proposalId !== undefined,
    },
    queryClient,
  ).data;
  const keptUntil =
    summary && ballotsExpireAt(Number(summary.vote_data.voting_ends_at), delay);
  const isInsufficientVotingPower = maxWeight <= 0;
  // Closing while the vote lands would lose its receipt.
  const close = () => {
    if (!isLoading) onClose();
  };

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
              ? errorMessage(err)
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
    flow.stage("prepare");
    try {
      const cast = await vote(
        projectName,
        proposalId!,
        selectedOption as VoteType,
        selectedWeight,
        { comment, onProgress: flow.stage },
      );

      setUnuploaded(cast.unuploaded);
      setVoteReceipt(cast.receipt);
      toast.success(
        "Congratulations!",
        "Your vote was submitted successfully.",
      );
    } catch (error: any) {
      setVoteError(
        `Failed to cast vote: ${
          error?.code === 4001
            ? "The transaction was cancelled by the user"
            : errorMessage(error)
        }`,
      );
      flow.reset();
      return;
    } finally {
      setIsLoading(false);
    }
  };

  if (voteReceipt) {
    return (
      <VoteReceiptView
        receipt={voteReceipt}
        unuploaded={unuploaded}
        onClose={onClose}
      />
    );
  }

  if (flow.working) {
    return (
      <Dialog onClose={close} closable={false}>
        <div className="flex flex-col gap-6">
          <h2 className="text-section font-bold">Sending your transaction</h2>
          <Stepper
            steps={flowSteps("vote").slice(0, comment.trim() ? 4 : 3)}
            current={flow.state.step ?? 0}
          />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog size="auto" onClose={close}>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-9">
        <img
          src="/images/box-with-coin-outside.svg"
          className="w-40 sm:w-60 md:w-80 lg:w-90 h-auto"
          alt=""
        />
        <div className="flex-grow flex flex-col gap-6 sm:gap-9 w-full">
          <Title
            title="Cast Your Vote"
            description={
              <div className="flex flex-wrap gap-1.5">
                <p>Vote on the proposal:</p>
                <p className="font-bold text-ink">{proposalTitle}</p>
              </div>
            }
          />
          <RadioGroup
            legend="Your vote"
            value={selectedOption ?? undefined}
            onChange={(voteType) => {
              setSelectedOption(voteType);
              setVoteError(null);
            }}
            options={[VoteType.APPROVE, VoteType.REJECT, VoteType.CANCEL].map(
              (voteType) => ({
                value: voteType,
                label: (
                  <span className={`font-semibold text-${voteType}`}>
                    {voteTypeLabelMap[voteType]}
                  </span>
                ),
                description: voteTypeDescriptionMap[voteType],
              }),
            )}
          />
          <VoteCommentField
            value={comment}
            onChange={setComment}
            anonymous={summary?.vote_data.public_voting === false}
            keptUntil={keptUntil}
          />
          {voteError && (
            <div className="bg-danger-soft border border-danger/40 text-danger px-4 py-2 rounded">
              {voteError}
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-ui font-semibold text-ink">
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
                className="w-full h-2 rounded-control appearance-none cursor-pointer accent-action"
                style={{
                  background: `linear-gradient(to right, var(--color-action) 0%, var(--color-action) ${votingPowerPercentage}%, var(--color-line) ${votingPowerPercentage}%, var(--color-line) 100%)`,
                }}
              />
              {isInsufficientVotingPower ? (
                <p className="text-label text-danger">
                  {insufficientPowerMessage}
                </p>
              ) : (
                <p className="text-label text-ink-muted">
                  {isTokenVoting
                    ? "Slide to adjust how many tokens to use as vote weight"
                    : "Slide to adjust your voting power"}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-4">
            <div className="flex gap-3">
              <Button tone="secondary" onClick={close} disabled={isLoading}>
                Close
              </Button>
              <Button
                loading={isLoading}
                disabled={
                  isInsufficientVotingPower || comment.length > MAX_VOTE_COMMENT
                }
                onClick={() => !isLoading && handleVote()}
              >
                Vote
              </Button>
            </div>
            <p className="text-ui sm:text-body text-ink-muted text-right">
              Once submitted, your vote and its comment cannot be changed.
            </p>
            <p className="px-3 py-1 text-ui sm:text-body bg-sunken text-ink">
              {isTokenVoting ? (
                <>
                  ℹ️ Token-based voting uses your current balance as the max
                  weight ({selectedWeight.toLocaleString()} token
                  {selectedWeight === 1 ? "" : "s"} selected).
                </>
              ) : (
                <>ℹ️ Your voting weight is capped by your project badges.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default VotingModal;
