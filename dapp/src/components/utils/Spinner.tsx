/** Busy, inline: in a button or next to text, in the text's color. */
export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      className={`inline-block w-4 h-4 shrink-0 rounded-full border-2 border-current border-b-transparent animate-spin ${className}`}
    >
      <span className="sr-only">Loading…</span>
    </span>
  );
}
