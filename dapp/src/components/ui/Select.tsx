import cx from "classnames";
import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { describe, Field, type FieldText } from "./Field";
import { ChevronDownIcon } from "./icons";
import { fieldBox } from "./style";

type SelectProps = FieldText & SelectHTMLAttributes<HTMLSelectElement>;

/** The platform's select, drawn like the other fields. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, hint, error, id, className, children, ...rest },
    ref,
  ) {
    const auto = useId();
    const field = id ?? auto;
    return (
      <Field id={field} label={label} hint={hint} error={error}>
        <span className="relative block">
          <select
            ref={ref}
            {...describe(field, { label, hint, error })}
            className={cx(
              fieldBox(!!error),
              "h-11 appearance-none pr-9 sm:h-10",
              className,
            )}
            {...rest}
          >
            {children}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted">
            <ChevronDownIcon />
          </span>
        </span>
      </Field>
    );
  },
);
