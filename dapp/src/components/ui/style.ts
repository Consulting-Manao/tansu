/**
 * Shared class strings of the kit. Tailwind only generates classes it reads
 * as whole literals, so every variant here is spelled out in full.
 */

/** Keyboard focus: a ring in the focus colour and a gold halo around it. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:ring-4 focus-visible:ring-accent/40";

/** A text field's box, or its error state. */
export const fieldBox = (invalid: boolean) =>
  [
    "w-full rounded-control border bg-surface px-3 text-body text-ink",
    "placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:opacity-50",
    focusRing,
    invalid ? "border-danger ring-3 ring-danger-soft" : "border-line-strong",
  ].join(" ");
