import { useStore } from "@nanostores/react";
import { useEffect } from "react";
import { Button, ButtonLink } from "components/ui";
import { connect, followWallet } from "@service/walletService";
import { memberUrl } from "utils/urls";
import { connectedPublicKey, walletInitialized } from "utils/store";

/** Connect a wallet, or go to the connected member's page. */
const ConnectButton = () => {
  const address = useStore(connectedPublicKey);
  const isReady = useStore(walletInitialized);

  useEffect(() => {
    void followWallet();
  }, []);

  if (address) {
    return (
      <ButtonLink
        href={memberUrl(address)}
        aria-label="Open user profile"
        title={address}
      >
        Profile
      </ButtonLink>
    );
  }
  return (
    <Button
      data-connect
      disabled={!isReady}
      // Closing the wallet picker is not an error.
      onClick={() => connect().catch(() => {})}
      aria-label="Connect wallet to start using Tansu"
    >
      Connect
    </Button>
  );
};

export default ConnectButton;
