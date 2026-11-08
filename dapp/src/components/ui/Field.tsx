import cx from "classnames";
import type { ReactNode } from "react";

export interface FieldText {
  label: ReactNode;
  /** Help under the control; an error takes its place. */
  hint?: ReactNode;
  error?: ReactNode;
}

/** The ids and states a control needs to be tied to its label and hint. */
export const describe = (id: string, { hint, error }: FieldText) => ({
  id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error || hint ? `${id}-hint` : undefined,
});

interface FieldProps extends FieldText {
  id: string;
  children: ReactNode;
}

/** A label, its control and a hint or an error, stacked. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-ui font-semibold text-ink">
        {label}
      </label>
      {children}
      {(error || hint) && (
        <p
          id={`${id}-hint`}
          className={cx("text-small", error ? "text-danger" : "text-ink-muted")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
