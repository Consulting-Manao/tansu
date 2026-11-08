import cx from "classnames";
import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { describe, Field, type FieldText } from "./Field";
import { fieldBox } from "./style";

type TextareaProps = FieldText & TextareaHTMLAttributes<HTMLTextAreaElement>;

/** A text area with its label, hint or error. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, error, id, className, ...rest }, ref) {
    const auto = useId();
    const field = id ?? auto;
    return (
      <Field id={field} label={label} hint={hint} error={error}>
        <textarea
          ref={ref}
          {...describe(field, { label, hint, error })}
          className={cx(fieldBox(!!error), "min-h-22 py-2.5", className)}
          {...rest}
        />
      </Field>
    );
  },
);
