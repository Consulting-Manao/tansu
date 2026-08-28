/**
 * Templates for proposal outcomes.
 *
 * Outcomes are the descriptions (and optional XDR/contract actions) attached to
 * each possible result of a proposal vote. There are 3 outcome types, one per
 * vote result:
 *   - approved: actions executed when the proposal is approved
 *   - rejected: actions executed when the proposal is rejected
 *   - cancelled: actions executed when the proposal is cancelled
 *
 * Selecting a template fills the outcome description with a structured
 * starting point that authors can edit before publishing.
 */

export type OutcomeType = "approved" | "rejected" | "cancelled";

export interface OutcomeTemplate {
  id: string;
  name: string;
  description: string;
  outcomeType: OutcomeType;
  content: string;
}

export const OUTCOME_TEMPLATES: OutcomeTemplate[] = [
  // ---------------------------------------------------------------- Approved
  {
    id: "approve-code-implementation",
    name: "Execute Code Implementation",
    description:
      "For approved code proposals: merge the commit and record it on-chain",
    outcomeType: "approved",
    content: `# Approved: Code Implementation

The proposal was approved by the community. The proposed code changes will be merged and the commit hash will be recorded on-chain as the new repository revision.

## Actions to Execute
- [ ] Merge the approved commit [commit hash]
- [ ] Record the commit hash on-chain
- [ ] Publish the updated revision to the project repository

## Technical Details
[Describe the XDR transaction or contract call that executes this outcome.]`,
  },
  {
    id: "approve-governance-update",
    name: "Apply Governance Update",
    description:
      "For approved governance proposals: apply the new rule on-chain",
    outcomeType: "approved",
    content: `# Approved: Governance Update

The proposal was approved. The governance rule change will now be applied on-chain and will take effect for future proposals and votes.

## Actions to Execute
- [ ] Update the governance parameter(s) described in the proposal
- [ ] Confirm the new rules in the project configuration
- [ ] Notify the community of the updated voting parameters`,
  },
  {
    id: "approve-award-disbursement",
    name: "Disburse Award",
    description:
      "For approved award/budget proposals: execute the transfer on-chain",
    outcomeType: "approved",
    content: `# Approved: Award Disbursement

The proposal was approved. The requested budget will be disbursed to the beneficiary and the transfer will be executed on-chain.

## Actions to Execute
- [ ] Transfer [amount] XLM to [beneficiary address]
- [ ] Record the disbursement transaction hash
- [ ] Publish the transfer proof and a short spending report`,
  },
  {
    id: "approve-membership-update",
    name: "Apply Membership Update",
    description:
      "For approved membership proposals: apply the maintainer/role change",
    outcomeType: "approved",
    content: `# Approved: Membership Update

The proposal was approved. The membership change will be applied to the project's maintainer list and role configuration.

## Actions to Execute
- [ ] Add/remove the maintainer at address [address]
- [ ] Update role permissions and voting weight
- [ ] Confirm the new membership configuration on-chain`,
  },

  // ---------------------------------------------------------------- Rejected
  {
    id: "reject-no-action",
    name: "No Action Taken",
    description:
      "Generic template for rejected proposals that require no execution",
    outcomeType: "rejected",
    content: `# Rejected: No Action Taken

The proposal was rejected by the community. No code changes will be merged and no on-chain action will be executed as a result of this proposal.

## Consequences
- The current repository revision remains unchanged
- No payments, rewards, or membership changes will be applied`,
  },
  {
    id: "reject-code-change",
    name: "Reject Code Change",
    description:
      "For rejected code proposals: the commit is not merged or recorded",
    outcomeType: "rejected",
    content: `# Rejected: Code Change Not Merged

The proposal was rejected. The proposed code changes will NOT be merged and the commit [commit hash] will not be recorded on-chain.

## Consequences
- The repository stays on revision [current revision]
- The author may revise the change and submit a new proposal`,
  },

  // --------------------------------------------------------------- Cancelled
  {
    id: "cancelled-no-action",
    name: "No Action Taken",
    description:
      "Generic template for cancelled proposals that require no execution",
    outcomeType: "cancelled",
    content: `# Cancelled: No Action Taken

The proposal was cancelled before the voting period concluded. No actions will be executed and no state changes will be applied.

## Consequences
- The current repository revision remains unchanged
- No payments, rewards, or membership changes were applied`,
  },
  {
    id: "cancelled-resubmission",
    name: "Ready for Resubmission",
    description:
      "For cancelled proposals that can be revised and resubmitted later",
    outcomeType: "cancelled",
    content: `# Cancelled: Ready for Resubmission

The proposal was cancelled by the proposer or the maintainers. The subject may be revised and resubmitted as a new proposal in the future.

## Notes
- No on-chain action was executed
- A new proposal should reference this cancellation for context`,
  },
];

export const getOutcomeTemplatesByType = (
  outcomeType: OutcomeType,
): OutcomeTemplate[] => {
  return OUTCOME_TEMPLATES.filter(
    (template) => template.outcomeType === outcomeType,
  );
};

export const getOutcomeTemplateById = (
  id: string,
): OutcomeTemplate | undefined => {
  return OUTCOME_TEMPLATES.find((template) => template.id === id);
};
