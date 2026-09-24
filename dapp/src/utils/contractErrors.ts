import { contractErrorMessages } from "../constants/contractErrorMessages";

const CONTRACT_ERROR = /Error\(Contract, #(\d+)\)/;

/** The contract error code in a message, e.g. 200 for "Error(Contract, #200)". */
function contractErrorCode(message: string): number | undefined {
  const code = message.match(CONTRACT_ERROR)?.[1];
  return code === undefined ? undefined : Number(code);
}

/**
 * What to tell the user about a failure: the contract's own words for a
 * contract error, a hint for a VM trap, else the error's message.
 */
export function errorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : ((error as { message?: string } | null)?.message ?? String(error));

  const code = contractErrorCode(message);
  if (code !== undefined) {
    return (
      contractErrorMessages[code as keyof typeof contractErrorMessages] ??
      `Contract error #${code}`
    );
  }

  if (/HostError: Error\(WasmVm,/.test(message)) {
    const fnName = message.match(
      /topics:\[fn_call,[^,]+,\s*([a-zA-Z0-9_]+)\]/,
    )?.[1];
    const where = fnName ? ` in ${fnName}()` : "";
    if (!/UnreachableCodeReached|InvalidAction/i.test(message)) {
      return `Contract VM error${where}. Please retry. If the issue persists, check project configuration.`;
    }
    if (fnName === "build_commitments_from_votes") {
      return `Invalid input for contract execution${where}. For anonymous voting, ensure your key file matches this proposal and try again.`;
    }
    if (fnName === "transfer") {
      return `Invalid input for contract execution${where}. Check the configured contract address and arguments for this proposal outcome.`;
    }
    return `Invalid input for contract execution${where}. Please verify proposal inputs and try again.`;
  }

  return message || "Unknown error";
}

type Read<T> = { result: T; simulation?: unknown };

/**
 * The value of a contract read, or `null` when the contract answers with one of
 * the `notFound` errors (e.g. 200, no such project). Any other failure throws
 * its user-facing message, so an RPC error never passes for missing data.
 */
export function readResult<T>(tx: Read<T>): T;
export function readResult<T>(
  tx: Read<T>,
  ...notFound: [number, ...number[]]
): T | null;
export function readResult<T>(tx: Read<T>, ...notFound: number[]): T | null {
  const error = (tx.simulation as { error?: string } | undefined)?.error;
  if (!error) return tx.result;
  const code = contractErrorCode(error);
  if (code !== undefined && notFound.includes(code)) return null;
  throw new Error(errorMessage(error));
}

/** Throws with parsed message if result has simulation.error or result.error. */
export function checkSimulationError(result: any): void {
  if (result?.simulation?.error) {
    throw new Error(errorMessage(result.simulation.error));
  }
  if (result?.error) {
    throw new Error(errorMessage(result.error));
  }
}
