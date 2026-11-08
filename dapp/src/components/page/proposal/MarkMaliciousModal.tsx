import { Button, Dialog } from "components/ui";
import { useState, type FC } from "react";
import { revokeProposal } from "@service/ProposalService";
import { toast } from "utils/utils";

interface MarkMaliciousModalProps {
  projectName: string;
  proposalId: number;
  proposalTitle: string;
  onClose: () => void;
  onMarked: () => void;
}

const MarkMaliciousModal: FC<MarkMaliciousModalProps> = ({
  projectName,
  proposalId,
  proposalTitle,
  onClose,
  onMarked,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleMarkMalicious = async () => {
    setIsLoading(true);
    try {
      await revokeProposal(projectName, proposalId);
      toast.success("Proposal revoked", "Its id is never reused.");
      onMarked();
    } catch (error: any) {
      toast.error(
        "Something went wrong",
        error.message || "Failed to revoke the proposal.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog size="auto" onClose={onClose}>
      <div className="flex max-w-lg flex-col gap-6">
        <h2 className="text-card font-semibold">Revoke this proposal?</h2>
        <p className="text-ink-muted">
          Revoking deletes{" "}
          <span className="font-semibold text-ink">“{proposalTitle}”</span>: its
          id is never reused and the proposer’s collateral is not returned. This
          cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button tone="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            tone="danger"
            onClick={handleMarkMalicious}
            loading={isLoading}
          >
            Revoke proposal
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default MarkMaliciousModal;
