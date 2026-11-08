import { Loading as KitLoading } from "components/ui";

/** Waiting for a page or a section. */
export default function Loading({ className }: { className?: string }) {
  return <KitLoading className={className} />;
}
