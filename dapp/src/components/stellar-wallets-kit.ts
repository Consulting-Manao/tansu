import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils";
import { LedgerModule } from "@creit-tech/stellar-wallets-kit/modules/ledger";
import { Networks } from "@creit-tech/stellar-wallets-kit/types";
import { NidoModule } from "@nidohq/stellar-wallets-kit-module";
import { GhostsigModule } from "./ghostsig";

const network = import.meta.env.PUBLIC_SOROBAN_NETWORK_PASSPHRASE;

StellarWalletsKit.init({
  modules: [
    ...defaultModules(),
    new LedgerModule(),
    new GhostsigModule({ network }),
    // Nido's hosted wallet and relayer run on testnet only.
    ...(network === Networks.TESTNET
      ? [
          new NidoModule({
            base: "https://nido.fyi",
            networkPassphrase: network,
          }),
        ]
      : []),
  ],
});
export { StellarWalletsKit };
