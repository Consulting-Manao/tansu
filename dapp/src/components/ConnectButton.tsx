import { useStore } from "@nanostores/react";
import { useEffect } from "react";
import { Button } from "components/ui";
import { connect, followWallet } from "@service/walletService";
import { openModal } from "utils/modals";
import { connectedPublicKey, walletInitialized } from "utils/store";

/** Connect a wallet, or open the connected member's profile. */
const ConnectButton = () => {
  const address = useStore(connectedPublicKey);
  const isReady = useStore(walletInitialized);

  useEffect(() => {
    void followWallet();
  }, []);

  const onClick = () => {
    if (!address) {
      // Closing the wallet picker is not an error.
      connect().catch(() => {});
      return;
    }
    openModal("profile", { address });
    void followWallet();
  };

  return (
    <Button
      data-connect
      disabled={!isReady && !address}
      onClick={onClick}
      aria-label={
        address ? "Open user profile" : "Connect wallet to start using Tansu"
      }
      title={address}
    >
      {address ? "Profile" : "Connect"}
    </Button>
  );
};

export default ConnectButton;
