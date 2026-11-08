import { PROPOSAL_TEMPLATES } from "constants/proposalTemplates";
import MarkdownEditorWithImages from "components/utils/MarkdownEditorWithImages";
import { Button, Input, Select, StepBar, Title } from "components/ui";
import { toast } from "utils/utils";
import { AnonymousKeySetup } from "./AnonymousKeySetup";
import TemplateSelector from "./TemplateSelector";
import type { ProposalDraft } from "./useProposalDraft";

/** The proposal's first step: voting, name and description. */
const ProposalBasicsStep = ({
  draft,
  onNext,
  onCancel,
}: {
  draft: ProposalDraft;
  onNext: () => void;
  onCancel: () => void;
}) => (
  <div className="flex flex-col gap-8 lg:gap-10">
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      <div className="flex-shrink-0">
        <img
          src="/images/idea.svg"
          alt=""
          className="w-16 h-16 lg:w-20 lg:h-20 mx-auto lg:mx-0"
        />
      </div>
      <div className="flex-grow space-y-6 lg:space-y-8">
        <div className="text-center lg:text-left">
          <StepBar step={1} totalSteps={4} />
          <Title
            title="Basic Information"
            description="Enter the title and description for your proposal to begin."
          />
        </div>

        <AnonymousKeySetup setup={draft.anonymous} />

        <div className="flex flex-col gap-2 sm:gap-3 max-w-2xl">
          <Select
            label="Voting type"
            value={draft.votingType}
            onChange={(e) =>
              draft.setVotingType(e.target.value as "badge" | "token")
            }
          >
            <option value="badge">Badge based</option>
            <option value="token">Token based</option>
          </Select>
          {draft.votingType === "token" && (
            <>
              <Input
                label="Token Contract Address"
                placeholder="Enter SAC token contract address (C...)"
                value={draft.tokenContract}
                onChange={(e) => draft.setTokenContract(e.target.value)}
              />
              {draft.tokenContract && (
                <span className="text-ui text-link">
                  Voting weight is capped by each voter's token balance.
                </span>
              )}
            </>
          )}
        </div>

        <div className="max-w-2xl">
          <Input
            label="Proposal Name"
            placeholder="Write the name"
            value={draft.proposalName}
            onChange={(e) => {
              draft.setProposalName(e.target.value);
              draft.setProposalNameError(null);
            }}
            error={draft.proposalNameError}
          />
        </div>
      </div>
    </div>

    <div className="space-y-4">
      <TemplateSelector
        templates={PROPOSAL_TEMPLATES}
        purpose="your proposal"
        onTemplateSelect={(template) => {
          draft.setMdText(template.content);
          draft.setDescriptionError(null);
        }}
      />
      <div className="flex items-center justify-between">
        <p className="text-card font-semibold text-ink">Description</p>
        <span className="text-ui text-ink-muted">
          Supports Markdown formatting
        </span>
      </div>
      <MarkdownEditorWithImages
        value={draft.mdText}
        onChange={(val) => {
          draft.setMdText(val);
          draft.setDescriptionError(null);
        }}
        imageFiles={draft.imageFiles}
        onImageFilesChange={draft.setImageFiles}
        imageError={draft.imageError}
        onImageErrorChange={draft.setImageError}
        placeholder="Input your proposal description here..."
      />
      {draft.descriptionError && (
        <p className="text-danger text-ui">{draft.descriptionError}</p>
      )}
    </div>

    <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 mt-6">
      <Button tone="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        onClick={() => {
          try {
            draft.checkBasics();
            onNext();
          } catch (err: any) {
            toast.error("Submit proposal", err.message);
          }
        }}
      >
        Next
      </Button>
    </div>
  </div>
);

export default ProposalBasicsStep;
