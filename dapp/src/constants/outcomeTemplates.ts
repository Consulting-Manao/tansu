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
 * Selecting a template pre-fills everything a user could otherwise fill out:
 * the description, and optionally the XDR transaction and/or the contract
 * call (address / function / arguments). Project-specific values (contract
 * addresses, amounts) are left as placeholders for the author to complete.
 */

export type OutcomeType = "approved" | "rejected" | "cancelled";

/** Pre-fill for a contract-call outcome. The address stays blank for the
 *  author to resolve (e.g. via the Stellar Registry search); the function
 *  name and argument placeholders are what the template contributes. */
export interface OutcomeTemplateContract {
  address: string;
  execute_fn: string;
  args: any[];
}

export interface OutcomeTemplate {
  id: string;
  name: string;
  description: string;
  outcomeType: OutcomeType;
  content: string;
  /** Optional XDR transaction pre-fill (base64 TransactionEnvelope). */
  xdr?: string;
  /** Optional contract-call pre-fill. */
  contract?: OutcomeTemplateContract;
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
    contract: {
      address: "",
      execute_fn: "record_commit",
      args: [""],
    },
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
    contract: {
      address: "",
      execute_fn: "update_config",
      args: [""],
    },
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
    contract: {
      address: "",
      execute_fn: "transfer",
      args: ["", 0],
    },
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
    contract: {
      address: "",
      execute_fn: "add_maintainer",
      args: [""],
    },
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

/** Which parts of an outcome a template pre-fills (used by the selector UI). */
export function getOutcomeTemplateFills(template: OutcomeTemplate): string[] {
  const fills = ["description"];
  if (template.xdr) fills.push("XDR");
  if (template.contract) fills.push("contract call");
  return fills;
}
