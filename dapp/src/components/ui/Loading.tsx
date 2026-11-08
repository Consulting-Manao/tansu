import cx from "classnames";

/** A page or a section waiting: the logo, breathing. */
export function Loading({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string | undefined;
}) {
  return (
    <div
      role="status"
      className={cx(
        "flex flex-col items-center justify-center gap-3 py-8",
        className,
      )}
    >
      <img src="/logo.svg" alt="" className="size-10 animate-pulse" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A line of text not there yet. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("block h-3 animate-pulse rounded-sm bg-sunken", className)}
    />
  );
}
