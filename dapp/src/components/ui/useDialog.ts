import { useEffect, useId, useRef, type RefObject } from "react";

// The open dialogs, innermost last: Escape and the backdrop close only the
// one on top, and the page scrolls again when the last one closes.
const openDialogs: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog's behaviour: focus moves in and back, Tab stays inside, Escape
 * closes the top dialog, the page under it does not scroll, and the dialog
 * is named by its first heading, whichever step shows.
 */
export function useDialog(
  panel: RefObject<HTMLElement | null>,
  close: () => void,
) {
  const self = useRef(Symbol("dialog")).current;
  const titleId = useId();
  const onClose = useRef(close);
  onClose.current = close;
  const isOnTop = () => openDialogs[openDialogs.length - 1] === self;

  useEffect(() => {
    openDialogs.push(self);
    document.body.style.overflow = "hidden";
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isOnTop()) return;
      if (event.key === "Escape") onClose.current();
      if (event.key !== "Tab" || !panel.current) return;
      const controls = [
        ...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((control) => control.offsetParent !== null);
      const first = controls[0];
      const last = controls[controls.length - 1];
      const at = document.activeElement;
      if (event.shiftKey && (at === first || at === panel.current)) {
        last?.focus();
        event.preventDefault();
      } else if (!event.shiftKey && at === last) {
        first?.focus();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      openDialogs.splice(openDialogs.indexOf(self), 1);
      if (!openDialogs.length) document.body.style.overflow = "";
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const heading = panel.current?.querySelector("h1, h2, h3, h4, h5, h6");
    if (!heading) return;
    heading.id ||= titleId;
    panel.current!.setAttribute("aria-labelledby", heading.id);
  });

  return { isOnTop };
}
