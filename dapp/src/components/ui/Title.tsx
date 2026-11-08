import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  description: ReactNode;
}

/** A dialog's or a step's title and the line under it. */
export const Title = ({ title, description }: Props) => (
  <div className="flex flex-col gap-2">
    <h2 className="text-section font-bold text-ink">{title}</h2>
    {description && (
      <div className="text-body text-ink-muted">{description}</div>
    )}
  </div>
);
