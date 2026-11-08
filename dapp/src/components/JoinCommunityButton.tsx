import { useStore } from "@nanostores/react";
import { Button } from "components/ui";
import { openModal } from "utils/modals";
import { connectedPublicKey } from "utils/store";

/** For visitors: join, connecting a wallet on the way. */
const JoinCommunityButton = () => {
  const publicKey = useStore(connectedPublicKey);

  // A connected wallet joins from its profile.
  if (publicKey) return null;

  return (
    <Button tone="ghost" onClick={() => openModal("join", {})}>
      Join
    </Button>
  );
};

export default JoinCommunityButton;
