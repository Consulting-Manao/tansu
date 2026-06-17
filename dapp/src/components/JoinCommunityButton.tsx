import { useState } from "react";
import Button from "components/utils/Button";
import JoinCommunityModal from "components/page/dashboard/JoinCommunityModal";

import { getMember } from "@service/ReadContractService";
import { useStore } from "@nanostores/react";
import { connectedPublicKey } from "utils/store";
import { useCachedQuery } from "@service/cache/cacheHooks";
import { queryKeys } from "@service/cache/cacheKeys";

const JoinCommunityButton = () => {
  const publicKey = useStore(connectedPublicKey);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const memberQuery = useCachedQuery({
    queryKey: queryKeys.membership.detail(publicKey || ""),
    queryFn: async () => {
      if (!publicKey) return null;
      return await getMember(publicKey);
    },
    ttlMs: 4 * 60 * 60 * 1000,
    enabled: !!publicKey,
  });

  const isMember = !!memberQuery.data;

  // Hide button only when wallet is connected AND user is already a member
  if (publicKey && isMember) {
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
          onJoined={() => {
            void memberQuery.refetch({ force: true });
            setShowJoinModal(false);
          }}
          prefillAddress={publicKey || ""}
        />
      )}
    </>
  );
};

export default JoinCommunityButton;
