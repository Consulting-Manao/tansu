import type { ReactNode } from "react";
import { ExpandableText } from "components/utils/ExpandableText";
import { Button, Label, Notice, StepBar, Title } from "components/ui";
import { formatDate } from "utils/formatTimeFunctions";
import { storedOutcomes } from "utils/proposalOutcomes";
import { capitalizeFirstLetter } from "utils/utils";
import type { ProposalDraft } from "./useProposalDraft";

const Actions = ({
  onBack,
  onRegister,
}: {
  onBack: () => void;
  onRegister: () => void;
}) => (
  <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 sm:gap-6">
    <Button tone="secondary" onClick={onBack} className="w-full sm:w-auto">
      Back
    </Button>
    <Button onClick={onRegister} className="w-full sm:w-auto">
      Register Proposal
    </Button>
  </div>
);

/** A step's answers, with the way back to it. */
const Section = ({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <p className="text-card sm:text-lead font-medium text-ink">{title}</p>
      <Button
        tone="secondary"
        size="sm"
        className="px-3 py-1 text-ui sm:text-body"
        onClick={onBack}
      >
        Back to the {title}
      </Button>
    </div>
    {children}
  </div>
);

const Mono = ({ children }: { children: ReactNode }) => (
  <p className="text-body sm:text-card text-ink break-all font-mono">
    {children}
  </p>
);

/** The proposal's last step: what will be submitted, and Register. */
const ProposalReviewStep = ({
  draft,
  onStep,
  onRegister,
}: {
  draft: ProposalDraft;
  onStep: (step: number) => void;
  onRegister: () => void;
}) => {
  const stored = Object.entries(storedOutcomes(draft.outcomes).outcomes);
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
        <img
          src="/images/note.svg"
          alt=""
          className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
        />
        <div className="flex-grow flex flex-col justify-center gap-6 sm:gap-8 text-center sm:text-left">
          <StepBar step={4} totalSteps={4} />
          <Title
            title="Review and Submit Your Proposal"
            description="Take a moment to review your proposal before submitting. You can go back and make changes if needed."
          />
          <Notice>
            Creating a proposal requires 5 XLM collateral. This collateral is
            refunded when the proposal is executed.
          </Notice>
          <Actions onBack={() => onStep(3)} onRegister={onRegister} />
        </div>
      </div>

      <div className="flex flex-col gap-8 sm:gap-10">
        <Section title="First Step" onBack={() => onStep(1)}>
          <Label label="Proposal name">
            <p className="text-card sm:text-lead text-ink break-words">
              {draft.proposalName}
            </p>
          </Label>
          <Label label="Proposal description">
            <ExpandableText>{draft.mdText}</ExpandableText>
          </Label>
        </Section>

        <div className="h-px bg-sunken" />

        <Section title="Second Step" onBack={() => onStep(2)}>
          {!stored.length ? (
            <Label label="Contract Calls">
              <p className="text-body sm:text-card text-ink-muted">None</p>
            </Label>
          ) : (
            stored.map(([kind, node]) => (
              <div key={kind} className="flex flex-col gap-4">
                <p
                  className={`text-card sm:text-lead font-medium text-${kind}`}
                >
                  {capitalizeFirstLetter(kind)} Outcome
                </p>
                <Label label="Description">
                  <ExpandableText>{node.description}</ExpandableText>
                </Label>
                {node.execution?.type === "xdr" && (
                  <Label label="XDR Transaction">
                    <Mono>{node.execution.xdr}</Mono>
                  </Label>
                )}
                {node.execution?.contract && (
                  <Label label="Contract Call">
                    <Mono>{node.execution.contract.address}</Mono>
                    <Mono>
                      {node.execution.contract.execute_fn}(
                      {node.execution.contract.args.join(", ")})
                    </Mono>
                  </Label>
                )}
                {!node.execution && (
                  <Label label="Action">
                    <p className="text-body sm:text-card text-ink-muted">
                      No automated action - description only
                    </p>
                  </Label>
                )}
              </div>
            ))
          )}
        </Section>

        <div className="h-px bg-sunken" />

        <Section title="Third Step" onBack={() => onStep(3)}>
          <Label label="Voting End Day">
            <p className="text-body sm:text-card text-ink">
              {formatDate(draft.selectedDate.toISOString())}
            </p>
          </Label>
        </Section>
      </div>

      <Actions onBack={() => onStep(3)} onRegister={onRegister} />
    </div>
  );
};

export default ProposalReviewStep;
