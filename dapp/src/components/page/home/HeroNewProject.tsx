import { useStore } from "@nanostores/react";
import { Button } from "components/ui";
import { connect } from "@service/walletService";
import { openModal } from "utils/modals";
import { connectedPublicKey } from "utils/store";

/** Register a project; without a wallet, the wallet picker comes first. */
export default function HeroNewProject() {
  const address = useStore(connectedPublicKey);
  const onClick = async () => {
    if (!address) {
      try {
        await connect();
      } catch {
        // Closing the wallet picker is not an error.
        return;
      }
    }
    openModal("createProject", {});
  };
  return (
    <Button tone="secondary" size="lg" onClick={onClick}>
      New project
    </Button>
  );
}
