import cx from "classnames";
import { Spinner } from "./Spinner";

interface StepperProps {
  /** The steps, in order: "Sign", "Upload to IPFS", "Send". */
  steps: string[];
  /** The step at work, 0-based; past ones show as done. */
  current: number;
}

/** "Step 2 of 4" and the steps, the one at work spinning. */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ui text-ink-muted">
        Step {Math.min(current + 1, steps.length)} of {steps.length}
      </p>
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className={cx(
              "flex items-center gap-3 text-body",
              index < current && "text-ink-muted",
              index === current && "font-semibold text-ink",
              index > current && "text-ink-subtle",
            )}
          >
            <span
              className={cx(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                index < current && "bg-success-soft text-success",
                index === current && "bg-accent-soft text-accent-ink",
                index > current && "border border-line-strong",
              )}
            >
              {index < current ? (
                "✓"
              ) : index === current ? (
                <Spinner />
              ) : (
                index + 1
              )}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
