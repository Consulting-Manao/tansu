import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import termsSummary from "../../../src/constants/terms-summary.json";
import { acceptTerms, termsAccepted } from "../../../src/utils/terms";

const KEY = "tansu_tos_accepted";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

describe("terms", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("versions the Terms by the date they state at their top", () => {
    const terms = readFileSync(
      new URL("../../../../legal/terms-of-service.md", import.meta.url),
      "utf8",
    );
    expect(terms).toContain(`**Last Updated: ${termsSummary.lastUpdated}**`);
  });

  it("asks until the current Terms are accepted", () => {
    expect(termsAccepted()).toBe(false);
    acceptTerms();
    expect(termsAccepted()).toBe(true);
    expect(JSON.parse(storage.getItem(KEY)!).version).toBe(
      termsSummary.lastUpdated,
    );
  });

  it("asks again once the Terms change", () => {
    for (const older of [
      "true",
      JSON.stringify({ accepted: true, version: "October 21, 2025" }),
      "{not json",
    ]) {
      storage.setItem(KEY, older);
      expect(termsAccepted()).toBe(false);
    }
  });

  it("asks nothing when the answer could not be kept", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(termsAccepted()).toBe(true);
  });
});
