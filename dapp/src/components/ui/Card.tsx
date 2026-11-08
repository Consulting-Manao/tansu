import cx from "classnames";
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Sunken: a quieter panel inside a card or on the page. */
  tone?: "raised" | "sunken";
}

/** A section of a page: surface, line, soft shadow. */
export function Card({
  tone = "raised",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <section
      className={cx(
        "rounded-card border p-4 sm:p-6",
        tone === "raised"
          ? "border-line bg-surface shadow-raise"
          : "border-transparent bg-sunken",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  /** A link or a small button on the right: "History", "All proposals". */
  action?: ReactNode;
}

/** A card's title and its one action. */
export function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-card font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}
