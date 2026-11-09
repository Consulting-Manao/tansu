import { useState, type FC } from "react";
import { vetoProposal } from "@service/ProposalService";
import {
  Button,
  FlowDialog,
  flowSteps,
  Textarea,
  useFlow,
} from "components/ui";

interface VetoProposalModalProps {
  projectName: string;
  proposalId: number;
  proposalTitle: string;
  onClose: () => void;
}

/**
 * A maintainer's veto: the proposal is rejected whatever the votes are, with
 * a reason everyone can read (a file on IPFS, uploaded once the call landed).
 */
const VetoProposalModal: FC<VetoProposalModalProps> = ({
  projectName,
  proposalId,
  proposalTitle,
  onClose,
}) => {
  const flow = useFlow();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const empty = reason.trim().length === 0;

  const veto = async () => {
    try {
      flow.stage("prepare");
      await vetoProposal({
        projectName,
        proposalId,
        reason: reason.trim(),
        onProgress: flow.stage,
      });
      flow.done();
    } catch (error) {
      flow.fail(error);
    }
  };

  return (
    <FlowDialog
      state={flow.state}
      onClose={onClose}
      steps={flowSteps("veto")}
      success={{
        title: "Proposal vetoed",
        description:
          "It stays on record, and the collateral went back to its proposer.",
      }}
    >
      <div className="flex max-w-lg flex-col gap-4">
        <h2 className="text-section font-bold">Veto this proposal?</h2>
        <p className="text-ink-muted">
          A veto rejects{" "}
          <span className="font-semibold text-ink">“{proposalTitle}”</span>{" "}
          whatever the votes are. It can never approve a proposal, it runs none
          of its outcomes and it cannot be undone. The proposal stays on record
          as vetoed and the proposer’s collateral is returned.
        </p>
        <Textarea
          label="Reason"
          placeholder="Why is this proposal vetoed?"
          hint="Everyone can read it: it is stored on IPFS and linked from the proposal."
          error={touched && empty ? "A reason is required" : undefined}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        <div className="flex justify-end gap-3">
          <Button tone="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button tone="danger" disabled={empty} onClick={veto}>
            Veto proposal
          </Button>
        </div>
      </div>
    </FlowDialog>
  );
};

export default VetoProposalModal;
