import Button from "components/utils/Button";
import Input from "components/utils/Input";
import VoterInfo from "components/utils/VoterInfo";
import Loading from "components/utils/Loading";
import Modal, { type ModalProps } from "components/utils/Modal";
import Title from "components/utils/Title";
import { useEffect, useState } from "react";
import { getConflictOfInterest } from "@service/ReadContractService";
import {
  addConflictOfInterest,
  removeConflictOfInterest,
} from "@service/ContractService";
import { toast } from "utils/utils";
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
  const [pendingAddresses, setPendingAddresses] = useState<string[]>([]);
  const [selectedAddresses, setSelectedAddresses] = useState<Set<string>>(
    new Set(),
  );
  const [selectedPendingAddresses, setSelectedPendingAddresses] = useState<
    Set<string>
  >(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAddress, setNewAddress] = useState<string>("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canEdit = !!connectedAddress && maintainers.includes(connectedAddress);

  const loadAddresses = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await getConflictOfInterest(projectName, proposalId);
      setAddresses(list);
    } catch (error: any) {
      setAddresses([]);
      setLoadError(
        error?.message || "Failed to load the conflict of interest list.",
      );
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAddresses();
  }, [projectName, proposalId]);

  const handleToggleSelection = (address: string) => {
    setSelectedAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedAddresses.size === addresses.length && addresses.length > 0) {
      setSelectedAddresses(new Set());
    } else {
      setSelectedAddresses(new Set(addresses));
    }
  };

  const handleTogglePendingSelection = (address: string) => {
    setSelectedPendingAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  };

  const handleSelectAllPending = () => {
    if (
      selectedPendingAddresses.size === pendingAddresses.length &&
      pendingAddresses.length > 0
    ) {
      setSelectedPendingAddresses(new Set());
    } else {
      setSelectedPendingAddresses(new Set(pendingAddresses));
    }
  };

  const handleAdd = () => {
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
    if (pendingAddresses.includes(trimmed)) {
      setInputError("Address already in pending list");
      return;
    }
    setInputError(null);
    setPendingAddresses((prev) => [...prev, trimmed]);
    setNewAddress("");
  };

  const handleRemovePending = (address: string) => {
    setPendingAddresses((prev) => prev.filter((a) => a !== address));
    if (selectedPendingAddresses.has(address)) {
      handleTogglePendingSelection(address);
    }
  };

  const handleBulkRemovePending = () => {
    setPendingAddresses((prev) =>
      prev.filter((addr) => !selectedPendingAddresses.has(addr)),
    );
    setSelectedPendingAddresses(new Set());
  };

  const handleApplyChanges = async () => {
    if (pendingAddresses.length === 0) return;

    setIsSubmitting(true);
    try {
      await addConflictOfInterest(projectName, proposalId, pendingAddresses);
      toast.success(
        "Conflict of Interest",
        `${pendingAddresses.length} address(es) added to the conflict list.`,
      );
      setPendingAddresses([]);
      setSelectedPendingAddresses(new Set());
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
      if (selectedAddresses.has(address)) {
        handleToggleSelection(address);
      }
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

  const handleBulkRemove = async () => {
    if (selectedAddresses.size === 0) return;

    setIsSubmitting(true);
    try {
      await removeConflictOfInterest(
        projectName,
        proposalId,
        Array.from(selectedAddresses),
      );
      toast.success(
        "Conflict of Interest",
        `${selectedAddresses.size} address(es) removed from the conflict list.`,
      );
      setSelectedAddresses(new Set());
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
    <div key={address} className="flex items-center gap-3">
      {canEdit && (
        <input
          type="checkbox"
          checked={selectedAddresses.has(address)}
          onChange={() => handleToggleSelection(address)}
          disabled={isSubmitting}
          className="w-4 h-4 cursor-pointer accent-primary shrink-0"
        />
      )}
      <div className="flex-grow">
        <VoterInfo
          address={address}
          action={
            canEdit ? (
              <Button
                type="tertiary"
                size="xs"
                onClick={() => handleRemove(address)}
                disabled={isSubmitting}
              >
                Remove
              </Button>
            ) : undefined
          }
        />
      </div>
    </div>
  );

  const description = canEdit
    ? "Maintainers can add or remove any address. Addresses on this list cannot vote on this proposal."
    : "Only maintainers can edit this list. Addresses on this list cannot vote on this proposal.";

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-6 w-full sm:w-[520px] relative">
        <Title
          title="Conflict of Interest"
          description={<p>{description}</p>}
        />

        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <p className="leading-4 text-base font-semibold text-primary">
              Current list
            </p>
            {canEdit && addresses.length > 0 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer text-secondary hover:text-primary transition-colors">
                <input
                  type="checkbox"
                  checked={
                    selectedAddresses.size === addresses.length &&
                    addresses.length > 0
                  }
                  onChange={handleSelectAll}
                  disabled={isSubmitting}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
                Select all
              </label>
            )}
          </div>
          {isLoading ? (
            <Loading />
          ) : loadError ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-red-600">{loadError}</p>
              <div>
                <Button type="tertiary" size="xs" onClick={loadAddresses}>
                  Retry
                </Button>
              </div>
            </div>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-tertiary italic">
              No addresses have been declared.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[280px] overflow-auto pr-1">
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
                disabled={isSubmitting || newAddress.trim() === ""}
              >
                Add
              </Button>
            </div>
          </div>
        )}

        {pendingAddresses.length > 0 && (
          <div className="flex flex-col gap-3 mt-2 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center">
              <p className="leading-4 text-base font-semibold text-primary">
                Pending to add
              </p>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-secondary hover:text-primary transition-colors">
                <input
                  type="checkbox"
                  checked={
                    selectedPendingAddresses.size === pendingAddresses.length &&
                    pendingAddresses.length > 0
                  }
                  onChange={handleSelectAllPending}
                  disabled={isSubmitting}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
                Select all
              </label>
            </div>
            <div className="flex flex-col gap-2 max-h-[200px] overflow-auto pr-1">
              {pendingAddresses.map((addr) => (
                <div key={addr} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedPendingAddresses.has(addr)}
                    onChange={() => handleTogglePendingSelection(addr)}
                    disabled={isSubmitting}
                    className="w-4 h-4 cursor-pointer accent-primary shrink-0"
                  />
                  <div className="flex-grow">
                    <VoterInfo
                      address={addr}
                      action={
                        <Button
                          type="tertiary"
                          size="xs"
                          onClick={() => handleRemovePending(addr)}
                          disabled={isSubmitting}
                        >
                          Remove
                        </Button>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end items-center gap-3 mt-2">
              {selectedPendingAddresses.size > 0 && (
                <Button
                  type="tertiary"
                  size="sm"
                  onClick={handleBulkRemovePending}
                  disabled={isSubmitting}
                >
                  Remove Selected ({selectedPendingAddresses.size})
                </Button>
              )}
              <Button
                onClick={handleApplyChanges}
                isLoading={isSubmitting}
                disabled={isSubmitting || pendingAddresses.length === 0}
              >
                Apply Changes
              </Button>
            </div>
          </div>
        )}

        {selectedAddresses.size > 0 && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 py-4 mt-2 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom-2">
            <p className="text-sm font-medium text-primary">
              {selectedAddresses.size} address
              {selectedAddresses.size > 1 ? "es" : ""} selected
            </p>
            <div className="flex gap-2">
              <Button
                type="tertiary"
                size="sm"
                onClick={() => setSelectedAddresses(new Set())}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBulkRemove}
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                Remove Selected
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ConflictOfInterestModal;
