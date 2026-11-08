import cx from "classnames";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { focusRing } from "./style";

/**
 * A small action that reads as a link: "History", "View all 5", "Show the
 * full discussion". A step away, not a commitment: commitments are Buttons.
 */
export const LinkButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function LinkButton({ className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-link underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-45",
        focusRing,
        className,
      )}
      {...rest}
    />
  );
});
