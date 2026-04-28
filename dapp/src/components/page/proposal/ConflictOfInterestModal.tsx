import Button from "components/utils/Button";
import Input from "components/utils/Input";
import Loading from "components/utils/Loading";
import Modal, { type ModalProps } from "components/utils/Modal";
import Title from "components/utils/Title";
import { useEffect, useState } from "react";
import { getConflictOfInterest } from "@service/ReadContractService";
import {
  addConflictOfInterest,
  removeConflictOfInterest,
} from "@service/ContractService";
import { toast, truncateMiddle } from "utils/utils";
import { validateStellarAddress } from "utils/validations";

interface Props extends ModalProps {
  projectName: string;
  proposalId: number;
  maintainers: string[];
  connectedAddress: string | null;
}

const ConflictOfInterestModal: React.FC<Props> = ({
  projectName,
  proposalId,
  maintainers,
  connectedAddress,
  onClose,
}) => {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAddress, setNewAddress] = useState<string>("");
  const [inputError, setInputError] = useState<string | null>(null);

  const canEdit = !!connectedAddress && maintainers.includes(connectedAddress);

  const loadAddresses = async () => {
    setIsLoading(true);
    try {
      const list = await getConflictOfInterest(projectName, proposalId);
      setAddresses(list);
    } catch {
      setAddresses([]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAddresses();
  }, [projectName, proposalId]);

  const handleAdd = async () => {
    const trimmed = newAddress.trim();
    if (!trimmed) {
      setInputError("Address is required");
      return;
    }
    const validationError = validateStellarAddress(trimmed);
    if (validationError) {
      setInputError(validationError);
      return;
    }
    if (addresses.includes(trimmed)) {
      setInputError("Address already listed");
      return;
    }
    setInputError(null);
    setIsSubmitting(true);
    try {
      await addConflictOfInterest(projectName, proposalId, [trimmed]);
      toast.success(
        "Conflict of Interest",
        "Address added to the conflict list.",
      );
      setNewAddress("");
      await loadAddresses();
    } catch (error: any) {
      toast.error(
        "Failed to add",
        error?.message || "Could not update the list.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (address: string) => {
    setIsSubmitting(true);
    try {
      await removeConflictOfInterest(projectName, proposalId, [address]);
      toast.success(
        "Conflict of Interest",
        "Address removed from the conflict list.",
      );
      await loadAddresses();
    } catch (error: any) {
      toast.error(
        "Failed to remove",
        error?.message || "Could not update the list.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRow = (address: string) => (
    <div
      key={address}
      className="flex items-center justify-between gap-3 p-[12px] bg-[#F8F6FB]"
    >
      <p className="font-mono text-sm text-primary break-all">
        {truncateMiddle(address, 24)}
      </p>
      {canEdit && (
        <Button
          type="tertiary"
          size="xs"
          onClick={() => handleRemove(address)}
          disabled={isSubmitting}
        >
          Remove
        </Button>
      )}
    </div>
  );

  const description = canEdit
    ? "Maintainers can add or remove any address. Addresses on this list cannot vote on this proposal."
    : "Only maintainers can edit this list. Addresses on this list cannot vote on this proposal.";

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-6 w-full sm:w-[520px]">
        <Title
          title="Conflict of Interest"
          description={<p>{description}</p>}
        />

        <div className="flex flex-col gap-3">
          <p className="leading-4 text-base font-semibold text-primary">
            Current list
          </p>
          {isLoading ? (
            <Loading />
          ) : addresses.length === 0 ? (
            <p className="text-sm text-tertiary italic">
              No addresses have been declared.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[280px] overflow-auto">
              {addresses.map((addr) => renderRow(addr))}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-col gap-3">
            <Input
              label="Add address"
              placeholder="G... address"
              value={newAddress}
              onChange={(e) => {
                setNewAddress(e.target.value);
                if (inputError) setInputError(null);
              }}
              disabled={isSubmitting}
              error={inputError}
            />
            <div className="flex justify-end">
              <Button
                onClick={handleAdd}
                isLoading={isSubmitting}
                disabled={isSubmitting || newAddress.trim() === ""}
              >
                Add
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ConflictOfInterestModal;
