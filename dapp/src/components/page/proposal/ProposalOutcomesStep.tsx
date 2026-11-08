import { useState } from "react";
import { Button, StepBar, Title } from "components/ui";
import { emptyOutcome, OUTCOMES } from "utils/proposalOutcomes";
import { capitalizeFirstLetter, toast } from "utils/utils";
import OutcomeInput from "./OutcomeInput";
import type { ProposalDraft } from "./useProposalDraft";

/** The proposal's second step: what each outcome says and calls. */
const ProposalOutcomesStep = ({
  draft,
  onNext,
  onBack,
}: {
  draft: ProposalDraft;
  onNext: () => void;
  onBack: () => void;
}) => {
  const [checking, setChecking] = useState(false);
  const { outcomes, setOutcomes, outcomeErrors, setOutcomeErrors } = draft;

  const next = async () => {
    try {
      draft.checkBasics();
      setChecking(true);
      await draft.checkOutcomeCalls();
      onNext();
    } catch (err: any) {
      toast.error("Submit proposal", err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <div className="flex flex-col gap-8 md:gap-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6">
          <img
            src="/images/cards.svg"
            alt=""
            className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
          />
          <div className="flex-grow flex flex-col justify-center gap-6 text-center sm:text-left">
            <StepBar step={2} totalSteps={4} />
            <Title
              title="Outcome Details"
              description="Provide descriptions and XDRs for approved, rejected, and canceled outcomes."
            />
          </div>
        </div>

        <div className="space-y-8">
          {OUTCOMES.map((kind) => {
            const outcome = outcomes[kind];
            return outcome ? (
              <OutcomeInput
                key={kind}
                type={kind}
                draft={outcome}
                onChange={(next) => {
                  setOutcomes((all) => ({ ...all, [kind]: next }));
                  // An edited call is checked afresh.
                  setOutcomeErrors(({ [kind]: _edited, ...rest }) => rest);
                }}
                callError={outcomeErrors[kind]}
                onRemove={() => {
                  setOutcomes(({ [kind]: _removed, ...rest }) => rest);
                  setOutcomeErrors(({ [kind]: _removed, ...rest }) => rest);
                }}
              />
            ) : (
              <div key={kind} className="flex justify-center">
                <Button
                  tone="secondary"
                  onClick={() =>
                    setOutcomes((all) => ({ ...all, [kind]: emptyOutcome() }))
                  }
                >
                  + Add {capitalizeFirstLetter(kind)} Outcome
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 sm:gap-6">
        <Button tone="secondary" onClick={onBack} className="w-full sm:w-auto">
          Back
        </Button>
        <Button loading={checking} onClick={next}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default ProposalOutcomesStep;
