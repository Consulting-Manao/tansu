import type { FC, ReactNode } from "react";

interface Props {
  label?: ReactNode;
  children?: ReactNode;
}

/** A caption over its content, like the kit's field labels. */
const Label: FC<Props> = ({ label, children }) => (
  <div className="flex flex-col gap-2">
    <div className="text-ui font-semibold text-ink">{label}</div>
    {children}
  </div>
);

export default Label;
