import {
  useId,
  type FC,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  description?: ReactNode;
  error?: string | null | undefined;
}

const Input: FC<Props> = ({
  className,
  label,
  description,
  error,
  ...inputProps
}) => {
  const hintId = useId();
  const hint = error || description;
  return (
    <div className="flex-grow flex flex-col gap-[18px]">
      <label className="flex flex-col gap-[18px]">
        {label && (
          <span className="leading-4 text-base font-semibold text-primary">
            {label}
          </span>
        )}
        <input
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          {...inputProps}
          className={`p-[18px] border ${
            error ? "border-red-500" : "border-[#978AA1]"
          } outline-none ${className ?? ""}`}
        />
      </label>

      {hint && (
        <p
          id={hintId}
          className={`leading-[16px] text-base ${error ? "text-red-500" : "text-tertiary"}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
