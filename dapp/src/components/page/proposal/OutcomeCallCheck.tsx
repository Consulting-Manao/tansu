import { StrKey } from "@stellar/stellar-sdk";
import { useQuery } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { useEffect, useState } from "react";
import { simulateOutcomeCall } from "@service/ContractIntrospectionService";
import { queryClient } from "@service/queryClient";
import type { OutcomeCall } from "utils/proposalOutcomes";

/** Wait for the author to stop typing before asking the network. */
const SETTLE_MS = 600;

/** A decoded value as JSON can show it: bigints as digits, bytes as hex. */
function plain(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, plain(v)]),
    );
  }
  return value;
}

/** A returned value as text, kept short. */
function shown(value: unknown): string {
  const text = JSON.stringify(plain(value)) ?? "nothing";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

/**
 * Whether an outcome's call runs as `execute` will make it, checked as the
 * author edits it. Next and creating the proposal check it again, and stop
 * there if it cannot run.
 */
const OutcomeCallCheck = ({ call }: { call: OutcomeCall }) => {
  const [settled, setSettled] = useState(call);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(call), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [call]);

  const ready =
    StrKey.isValidContract(settled.address) && settled.execute_fn !== "";
  const check = useQuery(
    {
      queryKey: [
        "outcomeSimulation",
        settled.address,
        settled.execute_fn,
        settled.args,
      ],
      queryFn: () => simulateOutcomeCall(settled),
      enabled: ready,
      // The ledger moves: a check is only as good as when it ran.
      staleTime: 0,
      gcTime: 0,
      retry: false,
    },
    queryClient,
  );

  const editing = settled !== call;
  if (!ready) return null;
  return (
    <div role="status" aria-live="polite" className="text-sm">
      {editing || check.isFetching ? (
        <p className="text-secondary">Checking the call...</p>
      ) : check.isError ? (
        <p className="text-red-500">✗ {check.error.message}</p>
      ) : check.data ? (
        <>
          <p className="text-green-800">
            ✓ Runs as the proposal would execute it now, returning{" "}
            <code className="font-mono">{shown(check.data.returns)}</code>. The
            ledger can change before the vote ends.
          </p>
          {check.data.authorizedBy.length > 0 && (
            <p className="text-amber-800">
              It needs {check.data.authorizedBy.join(", ")} to authorize it, so
              it runs only if that contract executes the proposal, as a manager
              contract does.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
};

export default OutcomeCallCheck;
