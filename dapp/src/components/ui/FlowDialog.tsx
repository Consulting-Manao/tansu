import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog, type DialogSize } from "./Dialog";
import { Notice } from "./Notice";
import { Stepper } from "./Stepper";
import { toast } from "./toast";

export interface FlowState {
  /** The form; or the signing steps; or the error that stopped the flow. */
  phase: "form" | "working" | "error" | "done";
  /** While working: the step at work in `steps`. */
  step?: number;
  error?: string | null | undefined;
  /** An error of a write that landed: asks for its upload again. */
  retry?: (() => void) | undefined;
}

interface FlowDialogProps {
  state: FlowState;
  onClose: () => void;
  /** The steps a write goes through once confirmed. */
  steps?: string[];
  /** The toast once the write landed, then the dialog closes. */
  success: { title: string; description?: string | undefined };
  onSuccess?: (() => void) | undefined;
  size?: DialogSize;
  children: ReactNode;
}

/**
 * A flow that ends with a write: its form, then the steps of the write
 * (closing is blocked while it signs and sends), then a toast once it landed;
 * or the error, in the dialog, where it happened.
 */
export function FlowDialog({
  state,
  onClose,
  steps = ["Prepare", "Sign in your wallet", "Send", "Upload to IPFS"],
  success,
  onSuccess,
  size,
  children,
}: FlowDialogProps) {
  useEffect(() => {
    if (state.phase !== "done") return;
    toast.success(success.title, success.description);
    onSuccess?.();
    onClose();
  }, [state.phase]);

  if (state.phase === "done") return null;
  const working = state.phase === "working";
  return (
    <Dialog onClose={onClose} closable={!working} size={size ?? "md"}>
      {state.phase === "error" ? (
        <div className="flex flex-col gap-6">
          <h2 className="text-section font-bold">Something went wrong</h2>
          <Notice tone="danger" live>
            {state.error}
          </Notice>
          <div className="flex justify-end gap-3">
            {state.retry ? (
              <>
                <Button tone="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={state.retry}>Try the upload again</Button>
              </>
            ) : (
              <Button onClick={onClose}>Close</Button>
            )}
          </div>
        </div>
      ) : working ? (
        <div className="flex flex-col gap-6">
          <h2 className="text-section font-bold">Sending your transaction</h2>
          <Stepper steps={steps} current={state.step ?? 0} />
        </div>
      ) : (
        children
      )}
    </Dialog>
  );
}
