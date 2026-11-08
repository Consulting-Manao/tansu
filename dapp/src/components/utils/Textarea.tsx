import { useId, type ChangeEventHandler, type FC, type ReactNode } from "react";
import { fieldBox } from "components/ui/style";

interface Props {
  className?: string;
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  value?: string | number | readonly string[];
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  error?: string | null | undefined;
}

/** The older text area API, drawn like the kit's fields. */
const Textarea: FC<Props> = ({
  className,
  label,
  description,
  placeholder,
  value,
  onChange,
  error,
}) => {
  const field = useId();
  const hint = error || description;
  return (
    <div className="flex min-w-0 grow flex-col gap-2">
      {label && (
        <label htmlFor={field} className="text-ui font-semibold text-ink">
          {label}
        </label>
      )}
      <textarea
        id={field}
        aria-describedby={hint ? `${field}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        className={`${fieldBox(!!error)} min-h-22 py-2.5 ${className ?? ""}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
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

export default Textarea;
