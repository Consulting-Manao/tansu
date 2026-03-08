import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils";
import { LedgerModule } from "@creit-tech/stellar-wallets-kit/modules/ledger";

StellarWalletsKit.init({ modules: [...defaultModules(), new LedgerModule()] });
export { StellarWalletsKit };
