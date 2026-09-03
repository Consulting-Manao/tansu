import { useCallback, useRef, useState } from "react";
import Input from "components/utils/Input";
import {
  getContractByName,
  STELLAR_REGISTRY_URL,
  type RegistryContract,
  type RegistryNetwork,
} from "@service/StellarRegistryService";

interface ContractNameSearchProps {
  /** Called with the resolved contract when the user picks a result. */
  onSelect: (contract: RegistryContract) => void;
  /** Placeholder for the search input. */
  placeholder?: string;
  /** Registry network to query (the registry currently indexes mainnet). */
  network?: RegistryNetwork;
  disabled?: boolean;
}

type Status = "idle" | "loading" | "found" | "not-registered" | "error";

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

/**
 * Exact-match contract name resolution backed by the Stellar Registry
 * smart contract (on-chain, no backend involved).
 *
 * The on-chain registry only supports exact name lookups, so there is no
 * suggestion list: the name is resolved on Enter or when leaving the field.
 * Unregistered names get an explicit "not on the registry" mark with a link
 * to the registry website so the author can double-check the name there.
 *
 * Deliberately decoupled from any feature: it only emits resolved contracts
 * through onSelect, so it can be embedded anywhere a contract address is
 * needed (e.g. tooling that must pick a deployed contract by name).
 */
export default function ContractNameSearch({
  onSelect,
  placeholder = "Exact contract name (Stellar Registry)",
  network = "mainnet",
  disabled = false,
}: ContractNameSearchProps) {
  const [query, setQuery] = useState("");
  const [resolved, setResolved] = useState<RegistryContract | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const resolveSeq = useRef(0);

  const resolve = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const seq = ++resolveSeq.current;

      if (!trimmed) {
        setResolved(null);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      try {
        const contract = await getContractByName(trimmed, network);
        if (resolveSeq.current !== seq) return; // a newer lookup superseded it
        if (contract) {
          setResolved(contract);
          setStatus("found");
        } else {
          setResolved(null);
          setStatus("not-registered");
        }
      } catch {
        if (resolveSeq.current !== seq) return;
        setResolved(null);
        setStatus("error");
      }
    },
    [network],
  );

  // Enter resolves immediately; leaving the field resolves what is typed.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void resolve(query);
    }
  };

  const handleBlur = () => {
    void resolve(query);
  };

  const handleUse = () => {
    if (resolved) {
      onSelect(resolved);
      setQuery("");
      setResolved(null);
      setStatus("idle");
    }
  };

  const showNotRegistered = status === "not-registered";
  const showFound = status === "found" && resolved !== null;

  return (
    <div className="relative w-full">
      <Input
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />

      {status === "loading" && (
        <p className="mt-1 text-xs text-secondary">
          Resolving on the Stellar Registry…
        </p>
      )}

      {showNotRegistered && (
        <p className="mt-1 text-xs text-red-500">
          “{query.trim()}” is not on the Stellar Registry.{" "}
          <a
            href={STELLAR_REGISTRY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Check the registry ↗
          </a>
        </p>
      )}

      {status === "error" && (
        <p className="mt-1 text-xs text-red-500">
          Could not reach the Stellar Registry. Press Enter to retry, or paste
          the address manually.
        </p>
      )}

      {showFound && (
        <div className="mt-2 flex flex-wrap justify-between items-center gap-2 p-2 border border-gray-300 rounded-md bg-white">
          <div>
            <span className="font-medium text-primary">
              {resolved!.contractName}
            </span>
            <span className="ml-2 text-xs text-secondary font-mono">
              {shortAddress(resolved!.contractId)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleUse}
            className="px-3 py-1 text-sm rounded-md bg-primary text-white cursor-pointer"
          >
            Use this address
          </button>
        </div>
      )}
    </div>
  );
}
