import cx from "classnames";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { focusRing } from "./style";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** A count beside the label: open proposals, people. */
  count?: number;
  panel: ReactNode;
}

interface TabsProps {
  /** What the tabs divide: the tab list's accessible name. */
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

/** Tabs and the selected panel. Arrows, Home and End move between tabs. */
export function Tabs({ label, items, value, onChange }: TabsProps) {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const at = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );
  // Tabs always have at least one item.
  const active = items[at] as TabItem;

  const onKeyDown = (event: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: (at + 1) % items.length,
      ArrowLeft: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    const next = keys[event.key];
    const item = next === undefined ? undefined : items[next];
    if (next === undefined || !item) return;
    event.preventDefault();
    onChange(item.id);
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div>
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none] sm:gap-8"
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${base}-tab-${item.id}`}
            aria-selected={index === at}
            aria-controls={`${base}-panel-${item.id}`}
            tabIndex={index === at ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              "relative shrink-0 py-4 text-body font-semibold whitespace-nowrap",
              index === at ? "text-ink" : "text-ink-muted hover:text-ink",
              focusRing,
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="figures-tabular ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-muted">
                {item.count}
              </span>
            )}
            {/* The slant: a gold parallelogram marks the current tab. */}
            {index === at && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0.5 -bottom-px h-1 -skew-x-24 bg-accent"
              />
            )}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${active.id}`}
        aria-labelledby={`${base}-tab-${active.id}`}
        tabIndex={0}
        className="pt-6 focus-visible:outline-none"
      >
        {active.panel}
      </div>
    </div>
  );
}
