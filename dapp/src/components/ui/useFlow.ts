import { useState } from "react";
import type { FlowState } from "./FlowDialog";

/** A write's stages, in the order FlowDialog lists them. */
const STAGES = ["prepare", "sign", "send", "upload"] as const;
export type FlowStage = (typeof STAGES)[number];

/** The steps a write shows while it signs and sends: "the vote", … */
export const flowSteps = (what: string) => [
  "Prepare the transaction",
  `Sign the ${what} transaction`,
  "Send and confirm",
  "Upload to IPFS",
];

/**
 * A write flow's state for FlowDialog: its form, a stage of the write (the
 * services report "sign", "send", "upload"), done (FlowDialog then shows
 * the toast and closes) or an error. An error that carries `retry` shows a
 * button that runs it again at the upload step.
 */
export function useFlow() {
  const [state, setState] = useState<FlowState>({ phase: "form" });
  const stage = (stage: FlowStage) =>
    setState({ phase: "working", step: STAGES.indexOf(stage) });
  const fail = (error: unknown) => {
    // A write that landed but could not upload its files carries `retry`.
    const retry = (error as { retry?: () => Promise<void> } | null)?.retry;
    setState({
      phase: "error",
      error: error instanceof Error ? error.message : String(error),
      retry:
        typeof retry === "function"
          ? async () => {
              stage("upload");
              try {
                await retry();
                setState({ phase: "done" });
              } catch (again) {
                fail(again);
              }
            }
          : undefined,
    });
  };
  return {
    state,
    working: state.phase === "working",
    stage,
    done: () => setState({ phase: "done" }),
    fail,
    reset: () => setState({ phase: "form" }),
  };
}
