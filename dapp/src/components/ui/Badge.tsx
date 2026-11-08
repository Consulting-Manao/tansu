import cx from "classnames";
import type { ReactNode } from "react";

export type BadgeTone =
  "neutral" | "success" | "danger" | "warning" | "info" | "accent";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-muted",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-ink",
};

interface BadgeProps {
  tone?: BadgeTone;
  /** A dot before the text: something live, like a vote running. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

/** A short status or role: "Voting · 2 days left", "Maintainer". */
export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "figures-tabular inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-label font-semibold leading-none whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
