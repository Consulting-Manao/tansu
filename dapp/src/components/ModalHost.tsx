import { useStore } from "@nanostores/react";
import Button from "components/utils/Button";
import { ErrorBoundary } from "components/utils/ErrorBoundary";
import Modal from "components/utils/Modal";
import { lazy, Suspense, useEffect } from "react";
import {
  closeAllModals,
  closeModal,
  openedModals,
  type Opened,
} from "utils/modals";

const CreateProjectModal = lazy(
  () => import("components/page/dashboard/CreateProjectModal"),
);
const ProfileModal = lazy(
  () => import("components/page/dashboard/ProfileModal"),
);
const MemberProfileModal = lazy(
  () => import("components/page/dashboard/MemberProfileModal"),
);
const TermsAcceptanceModal = lazy(
  () => import("components/utils/TermsAcceptanceModal"),
);
const WalletFundingModal = lazy(
  () => import("components/utils/WalletFundingModal"),
);

/** Shows the modals `openModal` opened, the last one on top. */
const ModalHost = () => {
  const modals = useStore(openedModals);

  useEffect(() => {
    document.addEventListener("astro:before-swap", closeAllModals);
    return () =>
      document.removeEventListener("astro:before-swap", closeAllModals);
  }, []);

  return (
    <Suspense fallback={null}>
      {modals.map((modal) => {
        const onClose = () => closeModal(modal.name);
        // A dialog that fails shows so, and closes like the others.
        return (
          <ErrorBoundary
            key={modal.name}
            fallback={
              <Modal onClose={onClose}>
                <div role="alert" className="flex flex-col gap-4">
                  <p className="text-primary">
                    This dialog could not be shown.
                  </p>
                  <Button type="secondary" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </Modal>
            }
          >
            {dialog(modal, onClose)}
          </ErrorBoundary>
        );
      })}
    </Suspense>
  );
};

function dialog(modal: Opened, onClose: () => void) {
  switch (modal.name) {
    case "createProject":
      return <CreateProjectModal onClose={onClose} />;
    case "join":
      return <ProfileModal mode="join" onClose={onClose} />;
    case "profile":
      return (
        <MemberProfileModal address={modal.props.address} onClose={onClose} />
      );
    case "funding":
      return (
        <WalletFundingModal
          isOpen
          onClose={onClose}
          minRequired={1}
          {...modal.props}
        />
      );
    case "terms":
      return (
        <TermsAcceptanceModal
          onAccept={onClose}
          onDecline={() => {
            onClose();
            window.location.href = "https://tansu.dev";
          }}
        />
      );
  }
}

export default ModalHost;
