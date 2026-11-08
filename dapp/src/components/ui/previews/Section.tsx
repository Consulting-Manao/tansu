import type { ReactNode } from "react";

/** A titled group of examples on the kit page. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-section font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** A row of examples that wraps on phones. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}
