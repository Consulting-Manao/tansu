import cx from "classnames";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Spinner } from "./Spinner";
import { focusRing } from "./style";

export type ButtonTone =
  "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

const tones: Record<ButtonTone, string> = {
  primary: "border-transparent bg-action text-on-action hover:bg-action-hover",
  secondary: "border-line-strong bg-surface text-ink hover:bg-sunken",
  ghost: "border-transparent bg-transparent text-ink hover:bg-sunken",
  danger:
    "border-transparent bg-danger-soft text-danger hover:bg-danger hover:text-surface",
  "danger-ghost":
    "border-transparent bg-transparent text-danger hover:bg-danger-soft",
};

// Phones get 44 px targets; pointers get the denser desktop heights.
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-small sm:h-8",
  md: "h-11 gap-2 px-4 text-body sm:h-10",
  lg: "h-12 gap-2 px-5 text-body",
};

interface Look {
  tone?: ButtonTone | undefined;
  size?: ButtonSize | undefined;
  /** Full width of its container. */
  block?: boolean | undefined;
  /** Leading icon. */
  icon?: ReactNode;
}

/** The classes of a button, for a <button> or a link that looks like one. */
export const buttonClass = ({ tone = "primary", size = "md", block }: Look) =>
  cx(
    "inline-flex items-center justify-center rounded-control border font-semibold leading-none whitespace-nowrap no-underline transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    focusRing,
    tones[tone],
    sizes[size],
    block && "w-full",
  );

interface ButtonProps extends Look, ButtonHTMLAttributes<HTMLButtonElement> {
  /** At work: a spinner, and no second click. */
  loading?: boolean | undefined;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      tone,
      size,
      block,
      icon,
      loading,
      disabled,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cx(buttonClass({ tone, size, block }), className)}
        {...rest}
      >
        {loading ? <Spinner /> : icon}
        {children}
      </button>
    );
  },
);

type ButtonLinkProps = Look & AnchorHTMLAttributes<HTMLAnchorElement>;

/** A link that reads as an action. */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    { tone, size, block, icon, className, children, ...rest },
    ref,
  ) {
    return (
      <a
        ref={ref}
        className={cx(buttonClass({ tone, size, block }), className)}
        {...rest}
      >
        {icon}
        {children}
      </a>
    );
  },
);
