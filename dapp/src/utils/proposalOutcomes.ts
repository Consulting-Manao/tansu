/**
 * A proposal's outcomes, from the author's drafts to what is written: the
 * outcomes.json the proposal page shows, and the contract calls in the slots
 * `execute` reads by position (Approved 0, Rejected 1, Cancelled 2).
 */
import type {
  StoredOutcomeNode,
  StoredProposalOutcome,
} from "../types/proposal";

export const OUTCOMES = ["approved", "rejected", "cancelled"] as const;
type Outcome = (typeof OUTCOMES)[number];

/** A contract call as the author enters it: arguments as typed. */
export interface OutcomeCall {
  address: string;
  execute_fn: string;
  args: string[];
}

export interface OutcomeDraft {
  description: string;
  mode: "contract" | "xdr" | "none";
  xdr: string;
  call: OutcomeCall;
}

/** The outcomes the author added; a removed one is absent. */
export type OutcomeDrafts = Partial<Record<Outcome, OutcomeDraft>>;

export const emptyOutcome = (): OutcomeDraft => ({
  description: "",
  mode: "contract",
  xdr: "",
  call: { address: "", execute_fn: "", args: [] },
});

/** The call an outcome makes: none unless both address and function are set. */
function outcomeCall(draft?: OutcomeDraft): OutcomeCall | undefined {
  if (draft?.mode !== "contract") return undefined;
  const address = draft.call.address.trim();
  const execute_fn = draft.call.execute_fn.trim();
  return address && execute_fn
    ? { address, execute_fn, args: draft.call.args }
    : undefined;
}

/** outcomes.json: what each outcome means, and what it runs. */
export function storedOutcomes(drafts: OutcomeDrafts): StoredProposalOutcome {
  const stored: StoredProposalOutcome = { outcomes: {} };
  for (const outcome of OUTCOMES) {
    const draft = drafts[outcome];
    if (!draft) continue;
    const call = outcomeCall(draft);
    const xdr = draft.mode === "xdr" ? draft.xdr.trim() : "";
    if (!draft.description.trim() && !call && !xdr) continue;
    const node: StoredOutcomeNode = { description: draft.description.trim() };
    if (call) node.execution = { type: "contract", contract: call };
    else if (xdr) node.execution = { type: "xdr", xdr };
    stored.outcomes[outcome] = node;
  }
  return stored;
}

/**
 * The calls in the contract's slots, up to the last outcome with one; a slot
 * before it with no call is `null`. `undefined` when no outcome has a call.
 */
export function outcomeSlots(
  drafts: OutcomeDrafts,
): (OutcomeCall | null)[] | undefined {
  const slots = OUTCOMES.map((outcome) => outcomeCall(drafts[outcome]) ?? null);
  const last = slots.findLastIndex((call) => call !== null);
  return last < 0 ? undefined : slots.slice(0, last + 1);
}
