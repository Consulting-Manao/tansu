import {
  useId,
  type FC,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { fieldBox } from "components/ui/style";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  description?: ReactNode;
  error?: string | null | undefined;
}

/** The older input API, drawn like the kit's fields. */
const Input: FC<Props> = ({
  className,
  label,
  description,
  error,
  id,
  ...inputProps
}) => {
  const auto = useId();
  const field = id ?? auto;
  const hint = error || description;
  return (
    <div className="flex min-w-0 grow flex-col gap-2">
      {label && (
        <label htmlFor={field} className="text-ui font-semibold text-ink">
          {label}
        </label>
      )}
      <input
        id={field}
        aria-describedby={hint ? `${field}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        {...inputProps}
        className={`${fieldBox(!!error)} h-11 sm:h-10 ${className ?? ""}`}
      />
      {hint && (
        <p
          id={`${field}-hint`}
          className={`text-small ${error ? "text-danger" : "text-ink-muted"}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
