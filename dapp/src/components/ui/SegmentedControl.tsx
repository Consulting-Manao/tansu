import cx from "classnames";
import type { ReactNode } from "react";
import { focusRing } from "./style";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  /** A count after the label: "Active 1". */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  /** What the segments choose: the group's accessible name. */
  label: string;
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Stretch over the container's width (phones). */
  block?: boolean;
}

/** A few views of the same thing: filters, a sort, a mode. */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
  block,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "gap-1 rounded-control border border-line bg-sunken p-0.75",
        block ? "flex" : "inline-flex",
      )}
    >
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          aria-pressed={segment.value === value}
          onClick={() => onChange(segment.value)}
          className={cx(
            "h-9 rounded-md px-3.5 text-ui font-medium whitespace-nowrap transition-colors sm:h-8",
            block && "flex-1",
            segment.value === value
              ? "bg-raised text-ink shadow-raise"
              : "text-ink-muted hover:text-ink",
            focusRing,
          )}
        >
          {segment.label}
          {segment.count !== undefined && (
            <span className="figures-tabular ml-1.5 text-ink-subtle">
              {segment.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
