import Button from "components/utils/Button";
import Modal from "components/utils/Modal";
import { useState, type FC } from "react";
import { revokeProposal } from "@service/ContractService";
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
      toast.success(
        "Proposal Revoked",
        "The proposal has been marked as malicious.",
      );
      onMarked();
    } catch (error: any) {
      toast.error(
        "Something went wrong",
        error.message || "Failed to mark proposal as malicious.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-6">
        <p className="text-xl font-medium text-primary">
          Mark Proposal as Malicious
        </p>
        <p className="text-secondary">
          Are you sure you want to mark{" "}
          <span className="font-semibold">"{proposalTitle}"</span> as malicious?
          This action cannot be undone. The proposal will be redacted and voters
          will not have their collateral returned.
        </p>
        <div className="flex gap-3 justify-end">
          <Button type="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="tertiary"
            className="border-red-500! text-red-500!"
            onClick={handleMarkMalicious}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : "Mark as Malicious"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default MarkMaliciousModal;
