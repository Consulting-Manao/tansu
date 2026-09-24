import { contractErrorMessages } from "../constants/contractErrorMessages";

/** Parses simulation/error message and returns user-facing contract error message. */
export function parseContractError(error: any): string {
  const errorMessage = error.message || error.toString();

  const errorMatch = errorMessage.match(/Error\(Contract, #(\d+)\)/);
  if (errorMatch && errorMatch[1]) {
    const errorCode = parseInt(errorMatch[1]);
    const parsedErrorMessage =
      contractErrorMessages[errorCode as keyof typeof contractErrorMessages];
    if (parsedErrorMessage) {
      return parsedErrorMessage;
    }
    return `Contract error #${errorCode}`;
  }

  const hostErrorMatch = errorMessage.match(
    /HostError: Error\(Contract, #(\d+)\)/,
  );
  if (hostErrorMatch && hostErrorMatch[1]) {
    const errorCode = parseInt(hostErrorMatch[1]);
    const parsedErrorMessage =
      contractErrorMessages[errorCode as keyof typeof contractErrorMessages];
    if (parsedErrorMessage) {
      return parsedErrorMessage;
    }
    return `Contract error #${errorCode}`;
  }

  if (/HostError: Error\(WasmVm,/.test(errorMessage)) {
    const fnMatch = errorMessage.match(
      /topics:\[fn_call,[^,]+,\s*([a-zA-Z0-9_]+)\]/,
    );
    const fnName = fnMatch?.[1];
    const where = fnName ? ` in ${fnName}()` : "";
    const hasInvalidInputPattern = /UnreachableCodeReached|InvalidAction/i.test(
      errorMessage,
    );

    if (hasInvalidInputPattern && fnName === "build_commitments_from_votes") {
      return `Invalid input for contract execution${where}. For anonymous voting, ensure your key file matches this proposal and try again.`;
    }

    if (hasInvalidInputPattern && fnName === "transfer") {
      return `Invalid input for contract execution${where}. Check the configured contract address and arguments for this proposal outcome.`;
    }

    if (hasInvalidInputPattern) {
      return `Invalid input for contract execution${where}. Please verify proposal inputs and try again.`;
    }

    return `Contract VM error${where}. Please retry. If the issue persists, check project configuration.`;
  }

  return errorMessage || "Unknown error during simulation";
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
  const code = Number(error.match(/Error\(Contract, #(\d+)\)/)?.[1]);
  if (notFound.includes(code)) return null;
  throw new Error(parseContractError({ message: error }));
}

/** Throws with parsed message if result has simulation.error or result.error. */
export function checkSimulationError(result: any): void {
  if (result?.simulation?.error) {
    throw new Error(parseContractError({ message: result.simulation.error }));
  }
  if (result?.error) {
    throw new Error(parseContractError({ message: result.error }));
  }
}
