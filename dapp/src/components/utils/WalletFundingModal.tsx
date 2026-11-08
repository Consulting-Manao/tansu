import { Button, Dialog } from "components/ui";

interface WalletFundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  exists: boolean;
  balance: number;
  minRequired: number;
  network?: "mainnet" | "testnet";
}

const WalletFundingModal = ({
  isOpen,
  onClose,
  exists,
  balance,
  minRequired,
}: WalletFundingModalProps) => {
  if (!isOpen) return null;

  const title = !exists ? "Wallet not funded" : "Low wallet balance";

  const message = !exists
    ? "Your wallet does not yet exist on this network. Please fund it with XLM before continuing."
    : `Your wallet balance is ${balance.toFixed(
        2,
      )} XLM — below the recommended minimum of ${minRequired.toFixed(
        2,
      )} XLM required for transactions.`;

  return (
    <Dialog size="auto" onClose={onClose}>
      <div className="flex flex-col items-center text-center gap-4 sm:gap-6 p-4 sm:p-6">
        <img
          src="/images/wrong.svg"
          alt="Wallet warning"
          className="w-16 h-16"
        />
        <h3 className="text-xl font-semibold text-ink">{title}</h3>
        <p className="text-sm sm:text-base text-ink-muted">{message}</p>

        <p className="text-xs text-ink-muted mt-2">
          You need XLM in your wallet to interact with this dApp.
        </p>

        <div className="w-full mt-3 flex justify-center">
          <Button
            onClick={onClose}
            tone="secondary"
            className="w-full sm:w-auto"
          >
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default WalletFundingModal;
