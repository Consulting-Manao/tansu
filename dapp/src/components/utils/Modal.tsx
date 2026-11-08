import type { FC, ReactNode } from "react";
import { Dialog } from "components/ui";

export interface ModalProps {
  id?: string;
  children?: ReactNode;
  onClose: () => void;
  fullWidth?: boolean;
  /** False while the dialog must stay open, e.g. during signing. */
  closable?: boolean;
}

/**
 * The older dialog API on the kit's Dialog (components/ui): flows move to
 * Dialog itself as their journeys move onto the kit.
 */
const Modal: FC<ModalProps> = ({
  children,
  onClose,
  fullWidth = false,
  closable = true,
}) => (
  <Dialog
    onClose={onClose}
    closable={closable}
    size={fullWidth ? "lg" : "auto"}
  >
    {children}
  </Dialog>
);

export default Modal;
