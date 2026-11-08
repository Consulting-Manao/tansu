import type { FC, ReactNode } from "react";

interface Props {
  title: ReactNode;
  description: ReactNode;
}

/** A dialog's or a step's title and the line under it. */
const Title: FC<Props> = ({ title, description }) => (
  <div className="flex flex-col gap-2">
    <h2 className="text-section font-bold text-ink">{title}</h2>
    {description && (
      <div className="text-body text-ink-muted">{description}</div>
    )}
  </div>
);

export default Title;
