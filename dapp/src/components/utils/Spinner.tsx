import { Spinner as KitSpinner } from "components/ui";

/** Busy, inline: in a button or next to text, in the text's color. */
export default function Spinner({ className = "" }: { className?: string }) {
  return <KitSpinner label="Loading…" className={className} />;
}
