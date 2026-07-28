import { useMemo } from "react";
import { VoteResultType, type ProposalView } from "types/proposal";
import { capitalizeFirstLetter } from "utils/utils";
import { calculateDateDifference } from "../../../utils/formatTimeFunctions";

interface Props {
  proposal: ProposalView | null;
}

const ProposalStatusSection: React.FC<Props> = ({ proposal }) => {
  const { status, voteResult, endDate } = useMemo(() => {
    if (!proposal) return {};
    const viewStatus = proposal.status;

    // Check if voting period has ended directly from endDate as a safety net
    // beyond what modifyProposalStatusToView already computes.
    const isExpired =
      proposal.endDate != null &&
      new Date(proposal.endDate * 1000) < new Date();

    // Result only comes from on-chain execution status — never computed
    // from vote scores for unexecuted proposals.
    let voteResult: VoteResultType | undefined = undefined;
    if (
      viewStatus === "approved" ||
      viewStatus === "rejected" ||
      viewStatus === "cancelled"
    ) {
      voteResult = viewStatus as VoteResultType;
    }

    const displayedStatus =
      viewStatus == "voted" || (viewStatus == "active" && isExpired)
        ? "pending execution"
        : viewStatus == "active"
          ? "active"
          : viewStatus == "malicious"
            ? "revoked"
            : "finished";

    return {
      status: displayedStatus,
      voteResult,
      endDate:
        viewStatus == "active" && !isExpired ? proposal.endDate : undefined,
    };
  }, [proposal]);

  return (
    <div className="grid grid-cols-2 gap-[18px]">
      {status && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tertiary">Status</p>
          <p className="text-lg text-tertiary">
            {capitalizeFirstLetter(status)}
          </p>
        </div>
      )}
      {voteResult && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tertiary">Result</p>
          <p className={`text-lg text-${voteResult}`}>
            {capitalizeFirstLetter(voteResult as string)}
          </p>
        </div>
      )}
      {endDate && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tertiary">End date</p>
          <p className={`text-lg text-${status}`}>
            {calculateDateDifference(endDate)}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProposalStatusSection;
