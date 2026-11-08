import { Badge, type BadgeTone } from "components/ui";
import type { ProposalView } from "types/proposal";
import {
  calculateDateDifference,
  formatUtcDate,
} from "utils/formatTimeFunctions";

/**
 * Where a proposal stands, in one badge: its vote running and the time
 * left, waiting to be executed, or the outcome executed on chain.
 */
const ProposalStatusBadge = ({ proposal }: { proposal: ProposalView }) => {
  const isExpired = new Date(proposal.endDate * 1000) < new Date();
  const left = calculateDateDifference(proposal.endDate);
  const [tone, label]: [BadgeTone, string] =
    proposal.status === "active" && !isExpired
      ? ["success", `Voting · ${left ? `${left} left` : "ends today"}`]
      : proposal.status === "active" || proposal.status === "voted"
        ? ["warning", "Pending execution"]
        : proposal.status === "approved"
          ? ["success", "Approved"]
          : proposal.status === "rejected"
            ? ["danger", "Rejected"]
            : proposal.status === "malicious"
              ? ["danger", "Revoked"]
              : ["neutral", "Cancelled"];
  return (
    <span title={`Vote ends ${formatUtcDate(proposal.endDate)} UTC`}>
      <Badge tone={tone} dot={tone === "success" && !isExpired}>
        {label}
      </Badge>
    </span>
  );
};

export default ProposalStatusBadge;
