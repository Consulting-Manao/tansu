import { useStore } from "@nanostores/react";
import { lazy, Suspense, useEffect } from "react";
import { closeModal, openedModal } from "utils/modals";

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

/** Shows the modal `openModal` opened. */
const ModalHost = () => {
  const modal = useStore(openedModal);

  useEffect(() => {
    document.addEventListener("astro:before-swap", closeModal);
    return () => document.removeEventListener("astro:before-swap", closeModal);
  }, []);

  if (!modal) return null;
  return (
    <Suspense fallback={null}>
      {modal.name === "createProject" && (
        <CreateProjectModal onClose={closeModal} />
      )}
      {modal.name === "join" && (
        <ProfileModal mode="join" onClose={closeModal} />
      )}
      {modal.name === "profile" && (
        <MemberProfileModal
          address={modal.props.address}
          onClose={closeModal}
        />
      )}
      {modal.name === "funding" && (
        <WalletFundingModal
          isOpen
          onClose={closeModal}
          minRequired={1}
          {...modal.props}
        />
      )}
      {modal.name === "terms" && (
        <TermsAcceptanceModal
          onAccept={closeModal}
          onDecline={() => {
            closeModal();
            window.location.href = "https://tansu.dev";
          }}
        />
      )}
    </Suspense>
  );
};

export default ModalHost;
