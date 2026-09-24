/** Waiting for a page or a section: Tansu's logo, spinning. */
export default function Loading({
  className = "w-10",
}: {
  className?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3"
    >
      <img
        src="/images/loading.svg"
        alt=""
        className={`${className} animate-spin`}
      />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
