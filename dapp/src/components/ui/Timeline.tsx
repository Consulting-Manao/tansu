import cx from "classnames";
import type { ReactNode } from "react";

export interface TimelineStep {
  label: string;
  /** When, or what: "Ends 9 Nov, 23:59", "Approved". */
  detail?: ReactNode;
  state: "done" | "now" | "todo";
}

/**
 * Where something stands in its life: steps done, the one now (the gold
 * slant marks it), those to come. Across on wide screens, down on phones.
 */
export function Timeline({
  label,
  steps,
}: {
  /** What the steps are of: the list's accessible name. */
  label: string;
  steps: TimelineStep[];
}) {
  return (
    <ol
      aria-label={label}
      className="grid gap-4 sm:auto-cols-fr sm:grid-flow-col sm:gap-0"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === "now" ? "step" : undefined}
          className="relative flex gap-3 sm:flex-col sm:gap-2 sm:pr-4"
        >
          {/* The rail to the next step, behind the marks. */}
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cx(
                "absolute top-5 bottom-[-1rem] left-[9px] w-0.5 sm:top-[9px] sm:right-0 sm:bottom-auto sm:left-5 sm:h-0.5 sm:w-auto",
                step.state === "done" ? "bg-link" : "bg-line-strong",
              )}
            />
          )}
          <span
            aria-hidden="true"
            className={cx(
              "relative z-10 mt-0.5 size-5 shrink-0 rounded-full border-2 sm:mt-0",
              step.state === "done" && "border-link bg-link",
              step.state === "now" &&
                "border-accent bg-surface ring-4 ring-accent/30",
              step.state === "todo" && "border-line-strong bg-surface",
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span
              className={cx(
                "font-semibold",
                step.state === "todo" ? "text-ink-muted" : "text-ink",
              )}
            >
              {step.label}
            </span>
            {step.detail && (
              <span className="text-small text-ink-muted">{step.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
