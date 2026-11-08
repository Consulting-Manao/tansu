import cx from "classnames";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { focusRing } from "./style";

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: ReactNode;
  /** A line under the label. */
  description?: ReactNode;
}

/** A checkbox and its label, the whole row clickable. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, description, className, ...rest }, ref) {
    return (
      <label
        className={cx(
          "inline-flex cursor-pointer items-start gap-2.5 text-body text-ink",
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className={cx("mt-0.5 size-4.5 shrink-0 accent-action", focusRing)}
          {...rest}
        />
        <span className="min-w-0">
          {label}
          {description && (
            <span className="block text-small text-ink-muted">
              {description}
            </span>
          )}
        </span>
      </label>
    );
  },
);
