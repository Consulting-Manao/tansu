import cx from "classnames";
import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { describe, Field, type FieldText } from "./Field";
import { fieldBox } from "./style";

type InputProps = FieldText & InputHTMLAttributes<HTMLInputElement>;

/** A one-line text field with its label, hint or error. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const field = id ?? auto;
  return (
    <Field id={field} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        {...describe(field, { label, hint, error })}
        className={cx(fieldBox(!!error), "h-11 sm:h-10", className)}
        {...rest}
      />
    </Field>
  );
});
