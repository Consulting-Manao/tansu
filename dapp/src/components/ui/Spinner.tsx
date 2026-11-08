import cx from "classnames";

interface SpinnerProps {
  /** Announced to screen readers; without it the spinner is decoration. */
  label?: string;
  className?: string | undefined;
}

/** Busy, inline: in a button or next to text, in the text's colour. */
export function Spinner({ label, className }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className={cx(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    >
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
