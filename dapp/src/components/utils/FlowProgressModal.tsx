import { FlowDialog, type FlowState } from "components/ui";

interface FlowProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  step: number;
  setStep: (step: number) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
  isSuccessful: boolean;
  setIsSuccessful: (success: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  signLabel?: string;
  successTitle?: string;
  successMessage?: string;
  children?: React.ReactNode;
}

/**
 * The older flow API on the kit's FlowDialog: steps 6 to 9 are the write
 * (prepare, sign, upload, send); a success becomes a toast and closes the
 * flow; an error shows in the dialog.
 */
const FlowProgressModal: React.FC<FlowProgressModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  step,
  setStep,
  isLoading,
  setIsLoading,
  setIsUploading,
  isSuccessful,
  setIsSuccessful,
  error,
  setError,
  signLabel = "action",
  successTitle = "Done",
  successMessage,
  children,
}) => {
  if (!isOpen) return null;

  const close = () => {
    setIsSuccessful(false);
    setStep(0);
    setIsLoading(false);
    setIsUploading(false);
    setError(null);
    onClose();
  };
  const working = isLoading && step >= 6 && step <= 9;
  const state: FlowState = error
    ? { phase: "error", error }
    : isSuccessful
      ? { phase: "done" }
      : working
        ? { phase: "working", step: step - 6 }
        : { phase: "form" };

  return (
    <FlowDialog
      state={state}
      onClose={close}
      onSuccess={onSuccess}
      steps={[
        "Prepare the transaction",
        `Sign the ${signLabel} transaction`,
        "Upload to IPFS",
        "Send and confirm",
      ]}
      success={{ title: successTitle, description: successMessage }}
      size="auto"
    >
      {children}
    </FlowDialog>
  );
};

export default FlowProgressModal;
