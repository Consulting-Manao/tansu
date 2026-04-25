import { votedTypeLabelMap } from "constants/constants";
import { useMemo, type FC } from "react";
import { VoteType, type VoteStatus } from "types/proposal";
import VoteTypeCheckbox from "./VoteTypeCheckbox";

interface Props {
  voteStatus: VoteStatus | undefined;
  status?: string;
  withDetail?: boolean;
  totalVotesOverride?: number;
  // When provided, the per-option numbers shown to users are counts of ballots,
  // not weighted scores. Final outcome still uses weighted scores.
  countsOverride?: { approve: number; reject: number; abstain: number };
}

const VotingResult: FC<Props> = ({
  voteStatus,
  status,
  withDetail,
  totalVotesOverride,
  countsOverride,
}) => {
  const voteResult = useMemo(() => {
    if (status === "approved") return VoteType.APPROVE;
    if (status === "rejected") return VoteType.REJECT;
    if (status === "cancelled") return VoteType.CANCEL;

    if (!voteStatus) return undefined;

    const { approve, abstain, reject } = voteStatus;

    if (approve.score > abstain.score + reject.score) return VoteType.APPROVE;
    if (reject.score > approve.score + abstain.score) return VoteType.REJECT;

    return VoteType.CANCEL;
  }, [voteStatus, status]);

  const isWinner = (type: VoteType) => voteResult === type;

  const getCardClass = (type: VoteType) => {
    const base =
      "flex flex-col gap-[18px] min-w-[120px] p-3 rounded-md transition-colors";

    if (!isWinner(type)) return base;

    const colors =
      type === VoteType.APPROVE
        ? "border-approved bg-green-50"
        : type === VoteType.REJECT
          ? "border-rejected bg-red-50"
          : "border-[#FFBD1E] bg-yellow-50";

    return `${base} border ${colors}`;
  };

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {voteResult && (
          <div className="flex flex-col gap-4.5">
            <p className="leading-4 text-base text-secondary">Final Outcome</p>
            <div className="flex items-center gap-2">
              <VoteTypeCheckbox size="sm" voteType={voteResult} />
              <p
                className={`leading-5 text-lg md:text-xl font-medium text-${voteResult}`}
              >
                {votedTypeLabelMap[voteResult]}
              </p>
            </div>
          </div>
        )}
        {withDetail && (
          <div className="flex flex-col gap-[18px]">
            <p className="leading-4 text-base text-secondary">
              Total Votes Cast
            </p>
            <p className="leading-6 text-lg md:text-xl text-primary">
              {totalVotesOverride !== undefined
                ? totalVotesOverride
                : countsOverride
                  ? countsOverride.abstain +
                    countsOverride.approve +
                    countsOverride.reject
                  : voteStatus &&
                    voteStatus.abstain.score +
                      voteStatus.approve.score +
                      voteStatus.reject.score}
            </p>
          </div>
        )}
      </div>

      {withDetail && (
        <div className="flex flex-col md:flex-row flex-wrap gap-4 md:gap-6 mt-4">
          {/* APPROVE */}
          <div className={getCardClass(VoteType.APPROVE)}>
            <div className="flex items-center justify-between">
              <p className="leading-4 text-base text-approved">Approved</p>
            </div>

            <p className="leading-6 text-lg md:text-xl text-primary">
              {countsOverride
                ? countsOverride.approve
                : voteStatus?.approve.score}{" "}
              votes
            </p>
          </div>

          {/* CANCEL */}
          <div className={getCardClass(VoteType.CANCEL)}>
            <div className="flex items-center justify-between">
              <p className="leading-4 text-base text-cancelled">Cancelled</p>
            </div>

            <p className="leading-6 text-lg md:text-xl text-primary">
              {countsOverride
                ? countsOverride.abstain
                : voteStatus?.abstain.score}{" "}
              votes
            </p>
          </div>

          {/* REJECT */}
          <div className={getCardClass(VoteType.REJECT)}>
            <div className="flex items-center justify-between">
              <p className="leading-4 text-base text-rejected">Rejected</p>
            </div>

            <p className="leading-6 text-lg md:text-xl text-primary">
              {countsOverride
                ? countsOverride.reject
                : voteStatus?.reject.score}{" "}
              votes
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default VotingResult;
