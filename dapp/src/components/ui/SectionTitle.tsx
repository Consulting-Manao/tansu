import type { ReactNode } from "react";

interface SectionTitleProps {
  children: ReactNode;
  /** A control on the right: a sort, "All proposals". */
  action?: ReactNode;
  id?: string;
}

/** A page section's title, under the gold slant that marks it. */
export function SectionTitle({ children, action, id }: SectionTitleProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="h-1.5 w-5 -skew-x-24 bg-accent" />
        <h2 id={id} className="text-section font-bold text-ink">
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}
