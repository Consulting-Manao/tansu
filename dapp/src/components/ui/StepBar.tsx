interface Props {
  step: number;
  totalSteps: number;
}

/** Where a form wizard stands: "Step 2 of 5" and its bar. */
export const StepBar = ({ step, totalSteps }: Props) => (
  <div className="flex flex-col gap-2">
    <p className="text-ui text-ink-muted">
      Step {step} of {totalSteps}
    </p>
    <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${(step / totalSteps) * 100}%` }}
      />
    </div>
  </div>
);
