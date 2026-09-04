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
 * call (address / function / arguments). The catalog intentionally stays
 * small and follows the concrete registry and public-goods proposals used by
 * Tansu.
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
    id: "interact-stellar-registry",
    name: "Interact with the Stellar Registry",
    description:
      "Publish an approved contract hash to the main/root Stellar Registry",
    outcomeType: "approved",
    content: `# Approved: Interact with the Stellar Registry

The proposal was approved by the community. The approved WASM hash will be published to the main/root Stellar Registry.

## Actions to Execute
- [ ] Resolve the approved contract through the Stellar Registry
- [ ] Call \`publish_hash\` with the contract name, admin account, WASM hash, and version
- [ ] Verify the published contract metadata on the registry

## Technical Details
- Contract name: \`registry-tansu-manager\`
- Admin account: \`GAMPJROHOAW662FINQ4XQOY2ULX5IEGYXCI4SMZYE75EHQBR6PSTJG3M\`
- WASM hash: \`f13e2e9d329a1b5e72eed4c3203f98c36d513e9915de2482c229fbe4367e6591\`
- Version: \`0.1.0\``,
    contract: {
      address: "",
      execute_fn: "publish_hash",
      args: [
        "registry-tansu-manager",
        "GAMPJROHOAW662FINQ4XQOY2ULX5IEGYXCI4SMZYE75EHQBR6PSTJG3M",
        "f13e2e9d329a1b5e72eed4c3203f98c36d513e9915de2482c229fbe4367e6591",
        "0.1.0",
      ],
    },
  },
  {
    id: "public-goods-award",
    name: "Award / Public Goods Grant",
    description:
      "Fund a public-goods maintenance proposal and report the payment",
    outcomeType: "approved",
    content: `# Approved: Public Goods Award

The proposal was approved by the community. The requested budget of \`20,000 XLM\` will be awarded to the public-goods project for the approved maintenance work.

## Award Details
- Amount: \`20,000 XLM\`
- Beneficiary: [beneficiary address or project treasury]
- Payment: [describe the payment schedule or transaction]

## Payment and Reporting
- [ ] Confirm the beneficiary and payment destination
- [ ] Execute the approved payment
- [ ] Record and publish the payment transaction hash
- [ ] Publish progress and completion reports for the funded deliverables`,
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
