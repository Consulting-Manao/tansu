/** Mirrors the finality/revocation constants in `contracts/tansu/src/types.rs`. */
export const MIN_FINALITY_THRESHOLD_PERCENT = 50;
export const MAX_FINALITY_THRESHOLD_PERCENT = 100;
export const DEFAULT_FINALITY_THRESHOLD_PERCENT = 66;

/** `ATTESTATION_REVOCATION_WINDOW`, in seconds. */
export const ATTESTATION_REVOCATION_WINDOW_SECONDS = 24 * 3600;

/** Returns an error message, or `null` when the value is a valid percent. */
export function validateFinalityThresholdPercent(
  value: string | number,
): string | null {
  const raw = typeof value === "number" ? value : value.trim();
  const percent = Number(raw);

  if (
    raw === "" ||
    !Number.isInteger(percent) ||
    percent < MIN_FINALITY_THRESHOLD_PERCENT ||
    percent > MAX_FINALITY_THRESHOLD_PERCENT
  ) {
    return `Must be a whole number between ${MIN_FINALITY_THRESHOLD_PERCENT} and ${MAX_FINALITY_THRESHOLD_PERCENT}`;
  }

  return null;
}

/**
 * An attestation can only be withdrawn while the target is not yet final and
 * the window since `created_at` is still open. Mirrors the contract's two
 * revocation guards so the UI hides an action that would revert.
 */
export function isAttestationRevocable(
  createdAt: bigint | number,
  isFinal: boolean,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (isFinal) return false;
  return (
    nowSeconds <= Number(createdAt) + ATTESTATION_REVOCATION_WINDOW_SECONDS
  );
}
