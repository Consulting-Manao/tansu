import { useState } from "react";
import type { FlowState } from "./FlowDialog";

/** A write's stages, in the order FlowDialog lists them. */
const STAGES = ["prepare", "sign", "upload", "send"] as const;
export type FlowStage = (typeof STAGES)[number];

/** The steps a write shows while it signs and sends: "the vote", … */
export const flowSteps = (what: string) => [
  "Prepare the transaction",
  `Sign the ${what} transaction`,
  "Upload to IPFS",
  "Send and confirm",
];

/**
 * A write flow's state for FlowDialog: its form, a stage of the write (the
 * services report "sign", "upload", "send"), done (FlowDialog then shows
 * the toast and closes) or an error.
 */
export function useFlow() {
  const [state, setState] = useState<FlowState>({ phase: "form" });
  return {
    state,
    working: state.phase === "working",
    stage: (stage: FlowStage) =>
      setState({ phase: "working", step: STAGES.indexOf(stage) }),
    done: () => setState({ phase: "done" }),
    fail: (error: unknown) =>
      setState({
        phase: "error",
        error: error instanceof Error ? error.message : String(error),
      }),
    reset: () => setState({ phase: "form" }),
  };
}
