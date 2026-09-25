/**
 * React Modal Component
 *
 * This is the React implementation of the Modal component, used for dynamic modals
 * that require React state management and event handling. It's used throughout the
 * React components in the application.
 *
 * NOTE: For static modals in Astro components, use Modal.astro instead.
 * The two implementations should maintain similar styling for consistency.
 */

import type { FC, ReactNode } from "react";
import { useEffect, useRef } from "react";

export interface ModalProps {
  id?: string;
  children?: ReactNode;
  onClose: () => void;
  fullWidth?: boolean;
  /** False while the dialog must stay open, e.g. during signing. */
  closable?: boolean;
}

// The open dialogs, innermost last: Escape and the backdrop close only the
// one on top, and the page scrolls again when the last one closes.
const openDialogs: symbol[] = [];

const Modal: FC<ModalProps> = ({
  id: _id,
  children,
  onClose,
  fullWidth = false,
  closable = true,
}) => {
  const self = useRef(Symbol("dialog")).current;
  const isOnTop = () => openDialogs[openDialogs.length - 1] === self;
  const close = useRef(() => {});
  close.current = () => {
    if (closable) onClose();
  };

  useEffect(() => {
    openDialogs.push(self);
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOnTop()) close.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      openDialogs.splice(openDialogs.indexOf(self), 1);
      if (!openDialogs.length) document.body.style.overflow = "";
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && isOnTop()) close.current();
  };

  // Clicks inside the dialog never reach the backdrop.
  const handleModalClick = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 bg-white/35 backdrop-blur-md flex justify-center items-center z-[2] p-2 sm:p-4 mt-4"
      onClick={handleBackdropClick}
      data-modal-container
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`modal relative bg-white shadow-modal rounded-lg max-w-[95vw] ${
          fullWidth ? "w-full max-w-6xl" : "w-full sm:w-auto"
        }`}
        onClick={handleModalClick}
      >
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-h-[85vh] overflow-auto">
          {children}
        </div>
        <button
          className="absolute top-1 right-1 sm:top-2 sm:right-2 md:top-0 md:right-0 md:translate-x-1/2 md:-translate-y-1/2 p-2 sm:p-[18px] bg-red cursor-pointer z-10 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => close.current()}
          disabled={!closable}
          aria-label="Close modal"
        >
          <img
            src="/icons/cancel-white.svg"
            alt="Close"
            className="w-3 h-3 sm:w-4 sm:h-4 md:w-auto md:h-auto"
          />
        </button>
      </div>
    </div>
  );
};

export default Modal;
