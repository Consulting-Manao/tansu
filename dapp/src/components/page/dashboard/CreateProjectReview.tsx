import type { ReactNode } from "react";
import { Button, Label, StepBar, Title } from "components/ui";

/** A step's answers in the review, with the way back to it. */
const ReviewSection = ({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) => (
  <>
    <div className="h-px bg-sunken" />
    <div className="flex flex-col gap-6">
      <div className="flex gap-6">
        <p className="leading-6 text-lead font-medium text-ink">{title}</p>
        <Button tone="secondary" size="sm" onClick={onBack}>
          Back to the {title}
        </Button>
      </div>
      {children}
    </div>
  </>
);

const Value = ({ children }: { children: ReactNode }) => (
  <p className="leading-6 text-lead break-all text-ink">{children}</p>
);

/** The register flow's last step: what will be registered, and Register. */
const CreateProjectReview = ({
  projectName,
  projectFullName,
  isSoftware,
  repositoryLabel,
  repositoryUrl,
  maintainers,
  finalityThreshold,
  onBack,
  onRegister,
  onCancel,
}: {
  projectName: string;
  projectFullName: string;
  isSoftware: boolean;
  repositoryLabel: string;
  repositoryUrl: string;
  maintainers: string[];
  finalityThreshold: string;
  onBack: (step: number) => void;
  onRegister: () => void;
  onCancel: () => void;
}) => (
  <div className="flex flex-col gap-7">
    <div className="flex items-center gap-4">
      <img alt="" className="w-90 flex-none" src="/images/note.svg" />
      <div className="flex flex-grow flex-col gap-7">
        <div className="flex flex-col gap-5">
          <StepBar step={4} totalSteps={4} />
          <Title
            title="Review and Submit Your Project"
            description="Take a moment to review your project details before submitting. You can go back and make changes if needed."
          />
          <p className="text-ui text-ink-muted">
            <span className="font-semibold">Note:</span> Project registration
            requires a 5 XLM collateral deposit.
          </p>
        </div>
        <div className="flex gap-4">
          <Button onClick={onRegister}>Register Project</Button>
          <Button tone="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
    <ReviewSection title="First Step" onBack={() => onBack(1)}>
      <Label label="Project Name (On-chain)">
        <Value>{projectName}</Value>
      </Label>
      {projectFullName && (
        <Label label="Project Full Name">
          <Value>{projectFullName}</Value>
        </Label>
      )}
      <Label label="Project type">
        <Value>
          {isSoftware ? "Software Project" : "Non-Software Project"}
        </Value>
      </Label>
      {isSoftware && (
        <Label label={repositoryLabel}>
          <Value>{repositoryUrl}</Value>
        </Label>
      )}
    </ReviewSection>
    <ReviewSection title="Second Step" onBack={() => onBack(2)}>
      <Label label="Maintainers">
        <div className="grid grid-cols-3 gap-x-9 gap-y-4">
          {maintainers.map((address, index) => (
            <p key={index} className="leading-3 text-ui text-ink-muted">
              {`(${address.slice(0, 24)}…)`}
            </p>
          ))}
        </div>
      </Label>
    </ReviewSection>
    <ReviewSection title="Third Step" onBack={() => onBack(3)}>
      <Label label="Finality threshold">
        <Value>{finalityThreshold}%</Value>
      </Label>
    </ReviewSection>
  </div>
);

export default CreateProjectReview;
