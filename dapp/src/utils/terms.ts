import termsSummary from "../constants/terms-summary.json";

/** Where the browser keeps the version of the Terms it accepted. */
const TERMS_KEY = "tansu_tos_accepted";

/**
 * Whether this browser accepted the current Terms: a record of an older
 * version, or of none, asks again. Without storage the answer could not be
 * kept either, so nothing is asked.
 */
export function termsAccepted(): boolean {
  let stored: string | null;
  try {
    stored = localStorage.getItem(TERMS_KEY);
  } catch {
    return true;
  }
  try {
    return JSON.parse(stored ?? "null")?.version === termsSummary.lastUpdated;
  } catch {
    return false;
  }
}

/** Records that this browser accepted the current Terms, and when. */
export function acceptTerms(): void {
  localStorage.setItem(
    TERMS_KEY,
    JSON.stringify({
      accepted: true,
      timestamp: new Date().toISOString(),
      version: termsSummary.lastUpdated,
    }),
  );
}
