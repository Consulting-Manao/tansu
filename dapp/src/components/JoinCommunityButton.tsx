import { useState } from "react";
import Button from "components/utils/Button";
import JoinCommunityModal from "components/page/dashboard/JoinCommunityModal";

import { useStore } from "@nanostores/react";
import { connectedPublicKey } from "utils/store";

/** For visitors: join, connecting a wallet on the way. */
const JoinCommunityButton = () => {
  const publicKey = useStore(connectedPublicKey);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // A connected wallet joins from its profile; a join in progress stays.
  if (publicKey && !showJoinModal) {
    return null;
  }

  return (
    <>
      <Button
        type="secondary"
        className="h-8 md:h-10 lg:h-12 px-3 md:px-4 lg:px-6 flex justify-center items-center gap-1 md:gap-2 shadow-button focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all duration-200"
        onClick={() => setShowJoinModal(true)}
      >
        <p className="text-xs md:text-sm lg:text-base font-medium text-primary truncate">
          Join
        </p>
      </Button>

      {showJoinModal && (
        <JoinCommunityModal
          onClose={() => setShowJoinModal(false)}
          onJoined={() => setShowJoinModal(false)}
          prefillAddress={publicKey || ""}
        />
      )}
    </>
  );
};

export default JoinCommunityButton;
