import { useId, type ReactNode } from "react";
import { focusRing } from "./style";

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
}

interface RadioGroupProps<T extends string> {
  legend: ReactNode;
  options: RadioOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  name?: string;
}

/** One choice among a few, each with its own line of explanation. */
export function RadioGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  name,
}: RadioGroupProps<T>) {
  const auto = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-ui font-semibold text-ink">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-2.5 text-body text-ink"
        >
          <input
            type="radio"
            name={name ?? auto}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className={`mt-0.5 size-4.5 shrink-0 accent-action ${focusRing}`}
          />
          <span className="min-w-0">
            {option.label}
            {option.description && (
              <span className="block text-small text-ink-muted">
                {option.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
