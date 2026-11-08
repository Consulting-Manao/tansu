import cx from "classnames";
import { useRef, type MouseEvent, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";
import { useDialog } from "./useDialog";

export type DialogSize = "sm" | "md" | "lg" | "auto";

const widths: Record<DialogSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-5xl",
  auto: "sm:w-auto sm:max-w-[min(95vw,64rem)]",
};

interface DialogProps {
  onClose: () => void;
  /** False while the dialog must stay open, during signing for instance. */
  closable?: boolean;
  size?: DialogSize;
  /** Hide the close button: a dialog that ends only with its own choices. */
  hideClose?: boolean;
  /** Bare: the content lays itself out (a header, a scrolling body, a
   *  footer); padded by default. */
  bare?: boolean;
  children?: ReactNode;
}

/**
 * A dialog over a scrim: a centred panel with a pointer, a sheet from the
 * bottom on phones. It is named by its first heading.
 */
export function Dialog({
  onClose,
  closable = true,
  size = "md",
  hideClose,
  bare,
  children,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    if (closable) onClose();
  };
  const { isOnTop } = useDialog(panel, close);

  const onBackdrop = (event: MouseEvent) => {
    if (event.target === event.currentTarget && isOnTop()) close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center sm:p-4"
      onClick={onBackdrop}
      data-modal-container
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-panel border border-line bg-surface text-ink shadow-float focus:outline-none sm:max-h-[85vh] sm:rounded-panel",
          widths[size],
        )}
      >
        {bare ? (
          children
        ) : (
          <div className="overflow-auto p-5 sm:p-8 [&>:first-child]:pr-10">
            {children}
          </div>
        )}
        {!hideClose && (
          <IconButton
            label="Close dialog"
            onClick={close}
            disabled={!closable}
            className="absolute top-2 right-2 sm:top-3 sm:right-3"
          >
            <CloseIcon />
          </IconButton>
        )}
      </div>
    </div>
  );
}
