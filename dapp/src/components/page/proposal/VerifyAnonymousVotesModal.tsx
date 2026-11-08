import { useState } from "react";
import { Button, Dialog, StepBar, Title } from "components/ui";
import { KeyFileField, TallyResult } from "./AnonymousTallyParts";
import { useAnonymousTally } from "./useAnonymousTally";

interface Props {
  onClose: () => void;
  projectName: string;
  proposalId: number;
}

/** For maintainers: count an anonymous vote while it runs, from the key file. */
const VerifyAnonymousVotesModal: React.FC<Props> = ({
  projectName,
  proposalId,
  onClose,
}) => {
  const [step, setStep] = useState(1);
  const tally = useAnonymousTally(projectName, proposalId);

  return (
    <Dialog size="auto" onClose={onClose}>
      {step === 1 ? (
        <div className="flex flex-col gap-6 sm:gap-7">
          <StepBar step={1} totalSteps={2} />
          <Title
            title="Upload anonymous key file"
            description="The private key will be used locally to decrypt votes and verify the proof."
          />
          <KeyFileField tally={tally} onCounted={() => setStep(2)} />
        </div>
      ) : (
        <div className="flex flex-col gap-6 sm:gap-7">
          <StepBar step={2} totalSteps={2} />
          <Title
            title="Decrypted tallies"
            description="Below are the tallies computed from decrypted votes."
          />
          <TallyResult
            tally={tally}
            projectName={projectName}
            proposalId={proposalId}
          />
          <div className="flex justify-center sm:justify-end">
            <Button tone="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default VerifyAnonymousVotesModal;
