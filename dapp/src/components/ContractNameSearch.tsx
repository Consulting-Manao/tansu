import { useCallback, useEffect, useRef, useState } from "react";
import Input from "components/utils/Input";
import {
  searchContracts,
  type RegistryContract,
  type RegistryNetwork,
} from "@service/StellarRegistryService";

interface ContractNameSearchProps {
  /** Called with the resolved contract when the user picks a result. */
  onSelect: (contract: RegistryContract) => void;
  /** Placeholder for the search input. */
  placeholder?: string;
  /** Passed through to the registry service (indexer currently serves mainnet). */
  network?: RegistryNetwork;
  disabled?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

/**
 * Standalone contract name search backed by the Stellar Registry.
 *
 * Deliberately decoupled from any feature: it only emits resolved contracts
 * through onSelect, so it can be embedded anywhere a contract address is
 * needed (outcomes today, other flows tomorrow).
 */
export default function ContractNameSearch({
  onSelect,
  placeholder = "Search by contract name (Stellar Registry)",
  network = "mainnet",
  disabled = false,
}: ContractNameSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistryContract[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);

  // Debounced search with stale-response guarding.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchContracts(trimmed, network)
        .then((contracts) => {
          if (searchSeq.current !== seq) return; // a newer search superseded this one
          setResults(contracts);
          setError(null);
          setIsOpen(true);
        })
        .catch(() => {
          if (searchSeq.current !== seq) return;
          setResults([]);
          setError(
            "Could not reach the Stellar Registry. Try again or paste the address manually.",
          );
        })
        .finally(() => {
          if (searchSeq.current === seq) setIsLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, network]);

  // Close the dropdown when clicking outside of the component.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const handleSelect = useCallback(
    (contract: RegistryContract) => {
      onSelect(contract);
      setQuery("");
      setResults([]);
      setError(null);
      setIsOpen(false);
    },
    [onSelect],
  );

  const showNoResults = isOpen && !isLoading && !error && results.length === 0;

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false);
        }}
      />

      {isLoading && (
        <p className="mt-1 text-xs text-secondary">
          Searching the Stellar Registry…
        </p>
      )}

      {!isLoading && error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}

      {showNoResults && (
        <p className="mt-1 text-xs text-secondary">
          No registered contracts found for “{query.trim()}”.
        </p>
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg">
          {results.map((contract) => (
            <button
              key={`${contract.channel}/${contract.contractId}`}
              type="button"
              onClick={() => handleSelect(contract)}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex justify-between items-center gap-2">
                <span className="font-medium text-primary">
                  {contract.contractName}
                </span>
                <span className="text-xs text-secondary">
                  {contract.channel}
                </span>
              </div>
              <span className="text-xs text-secondary font-mono">
                {shortAddress(contract.contractId)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
