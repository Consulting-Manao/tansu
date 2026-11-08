import type { ReactNode } from "react";

interface EmptyStateProps {
  /** One of the hand-drawn illustrations in /images. */
  image?: string;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

/** Nothing here yet, or nothing found: what happened and what to do. */
export function EmptyState({
  image,
  title,
  children,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      {image && <img src={image} alt="" className="h-32 w-auto opacity-90" />}
      <p className="text-card font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-ink-muted">{children}</div>}
      {action}
    </div>
  );
}
