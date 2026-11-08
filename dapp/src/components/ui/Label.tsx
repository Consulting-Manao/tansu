import type { ReactNode } from "react";

interface Props {
  label?: ReactNode;
  children?: ReactNode;
}

/** A caption over content that is not a field: a value, a group, a list. */
export const Label = ({ label, children }: Props) => (
  <div className="flex flex-col gap-2">
    <div className="text-ui font-semibold text-ink">{label}</div>
    {children}
  </div>
);
