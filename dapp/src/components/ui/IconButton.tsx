import cx from "classnames";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { focusRing } from "./style";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** What the button does: its accessible name and its tooltip. */
  label: string;
  children: ReactNode;
  tone?: "ghost" | "secondary";
}

/** A square button with an icon only: 44 px on phones, 40 px with a pointer. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, tone = "ghost", className, children, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cx(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-control border text-ink transition-colors sm:size-10",
          "disabled:cursor-not-allowed disabled:opacity-45",
          tone === "ghost"
            ? "border-transparent hover:bg-sunken"
            : "border-line-strong bg-surface hover:bg-sunken",
          focusRing,
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
