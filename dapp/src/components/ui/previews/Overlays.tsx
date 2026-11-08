import { useState } from "react";
import {
  Button,
  Dialog,
  FlowDialog,
  Input,
  Stepper,
  toast,
  type FlowState,
} from "..";
import { Row, Section } from "./Section";

const steps = ["Prepare", "Sign in your wallet", "Upload to IPFS", "Send"];

export function Overlays() {
  const [dialog, setDialog] = useState(false);
  const [flow, setFlow] = useState<FlowState | null>(null);
  const run = () => {
    setFlow({ phase: "working", step: 0 });
    steps.forEach((_, step) =>
      window.setTimeout(() => setFlow({ phase: "working", step }), step * 600),
    );
    window.setTimeout(() => setFlow({ phase: "done" }), steps.length * 600);
  };
  return (
    <Section title="Dialogs and feedback">
      <Row>
        <Button tone="secondary" onClick={() => setDialog(true)}>
          Open a dialog
        </Button>
        <Button tone="secondary" onClick={() => setFlow({ phase: "form" })}>
          Start a flow
        </Button>
        <Button
          tone="secondary"
          onClick={() =>
            toast.success(
              "Badges saved",
              "@bob is now Developer and Community.",
            )
          }
        >
          Show a toast
        </Button>
        <Button
          tone="danger-ghost"
          onClick={() => toast.error("Wallet not funded", "Fund it first.")}
        >
          Show an error
        </Button>
      </Row>
      <div className="max-w-sm">
        <Stepper steps={steps} current={2} />
      </div>
      {dialog && (
        <Dialog onClose={() => setDialog(false)}>
          <div className="flex flex-col gap-4">
            <h2 className="text-section font-bold">Add a badge</h2>
            <Input label="Member address" placeholder="G…" />
            <div className="flex justify-end gap-3">
              <Button tone="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialog(false)}>Save badges</Button>
            </div>
          </div>
        </Dialog>
      )}
      {flow && (
        <FlowDialog
          state={flow}
          steps={steps}
          onClose={() => setFlow(null)}
          success={{
            title: "Vote recorded",
            description: "Approve, weight 10,000,000.",
          }}
        >
          <div className="flex flex-col gap-4">
            <h2 className="text-section font-bold">Vote</h2>
            <p className="text-ink-muted">Approve, reject or abstain.</p>
            <Button onClick={run}>Vote</Button>
          </div>
        </FlowDialog>
      )}
    </Section>
  );
}
