import { useStore } from "@nanostores/react";
import { useEffect } from "react";
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
    <div className="relative">
      {!address && (
        <div
          className="absolute hidden top-6 -left-16 xl:flex flex-col gap-2 transform -rotate-[13deg]"
          aria-hidden="true"
        >
          <img src="/arrow.svg" alt="" className="w-[56px] h-[69px]" />
          <p className="text-victormono text-lg italic text-zinc-700 text-nowrap">
            Get Started
          </p>
        </div>
      )}
      <button
        data-connect
        disabled={!isReady && !address}
        onClick={onClick}
        aria-label={
          address ? "Open user profile" : "Connect wallet to start using Tansu"
        }
        title={address}
        className={`h-8 md:h-10 lg:h-12 px-3 md:px-4 lg:px-6 flex justify-center items-center gap-1 md:gap-2 shadow-button truncate focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all duration-200 ${
          address
            ? "bg-primary text-white hover:opacity-90 cursor-pointer"
            : "bg-white"
        }`}
      >
        {address ? (
          <>
            <span className="hidden sm:inline text-xs md:text-sm lg:text-base font-medium text-white truncate">
              Profile
            </span>
            <img
              src="/icons/profile.svg"
              alt=""
              className="w-4 md:w-5 h-4 md:h-5 flex-shrink-0"
            />
          </>
        ) : (
          <>
            <span className="text-xs md:text-sm lg:text-base font-medium text-pink truncate">
              Connect
            </span>
            <img
              src="/icons/connect.png"
              alt=""
              className="w-3 md:w-4 lg:w-5 h-3 md:h-4 lg:h-5 flex-shrink-0"
            />
          </>
        )}
      </button>
    </div>
  );
};

export default ConnectButton;
