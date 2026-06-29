import { beforeEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "buffer";

const getEvidenceMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/contracts/soroban_tansu", () => ({
  default: {
    get_evidence: getEvidenceMock,
  },
}));

import {
  getEvidenceByKind,
  getEvidenceForCommit,
  getEvidenceHistory,
  invalidateEvidenceCache,
} from "../../../src/service/EvidenceService";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("EvidenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the latest evidence for each kind and omits empty kinds", async () => {
    getEvidenceMock.mockImplementation(
      ({ kind }: { kind: { tag: string } }) => {
        if (kind.tag === "Attestation") {
          return Promise.resolve({ result: [] });
        }

        return Promise.resolve({
          result: [{ cid: `bafy-${kind.tag.toLowerCase()}`, created_at: 42 }],
        });
      },
    );

    const evidence = await getEvidenceForCommit(
      "evidence-service-all",
      "commit-a",
    );

    expect(evidence).toEqual([
      { kind: "Sbom", cid: "bafy-sbom", created_at: 42 },
      { kind: "Cve", cid: "bafy-cve", created_at: 42 },
    ]);
    expect(getEvidenceMock).toHaveBeenCalledTimes(3);
  });

  it("returns null when an evidence kind has no entries", async () => {
    getEvidenceMock.mockResolvedValue({ result: [] });

    await expect(
      getEvidenceByKind("evidence-service-missing", "commit-a", "Sbom"),
    ).resolves.toBeNull();
  });

  it("returns the most recent entry of the history", async () => {
    getEvidenceMock.mockResolvedValue({
      result: [
        { cid: "bafy-old", created_at: 1 },
        { cid: "bafy-latest", created_at: 2 },
      ],
    });

    await expect(
      getEvidenceByKind("evidence-service-latest", "commit-a", "Sbom"),
    ).resolves.toEqual({ kind: "Sbom", cid: "bafy-latest", created_at: 2 });
  });

  it("deduplicates concurrent lookups for the same project commit and kind", async () => {
    const deferred = createDeferred<{
      result: { cid: string; created_at: number }[];
    }>();
    getEvidenceMock.mockReturnValue(deferred.promise);

    const projectKey = Buffer.from("1234", "hex");
    const first = getEvidenceByKind(projectKey, "commit-a", "Sbom");
    const second = getEvidenceByKind(projectKey, "commit-a", "Sbom");

    expect(getEvidenceMock).toHaveBeenCalledTimes(1);

    deferred.resolve({ result: [{ cid: "bafy-deduped", created_at: 1 }] });

    await expect(first).resolves.toEqual({
      kind: "Sbom",
      cid: "bafy-deduped",
      created_at: 1,
    });
    await expect(second).resolves.toEqual({
      kind: "Sbom",
      cid: "bafy-deduped",
      created_at: 1,
    });
  });

  it("can fetch the latest evidence after cache invalidation", async () => {
    const projectKey = Buffer.from("5678", "hex");

    getEvidenceMock
      .mockResolvedValueOnce({ result: [{ cid: "bafy-old", created_at: 1 }] })
      .mockResolvedValueOnce({ result: [{ cid: "bafy-new", created_at: 2 }] });

    await expect(
      getEvidenceByKind(projectKey, "commit-a", "Sbom"),
    ).resolves.toEqual({
      kind: "Sbom",
      cid: "bafy-old",
      created_at: 1,
    });

    await expect(
      getEvidenceByKind(projectKey, "commit-a", "Sbom"),
    ).resolves.toEqual({
      kind: "Sbom",
      cid: "bafy-old",
      created_at: 1,
    });
    expect(getEvidenceMock).toHaveBeenCalledTimes(1);

    invalidateEvidenceCache(projectKey, "commit-a");

    await expect(
      getEvidenceByKind(projectKey, "commit-a", "Sbom"),
    ).resolves.toEqual({
      kind: "Sbom",
      cid: "bafy-new",
      created_at: 2,
    });
    expect(getEvidenceMock).toHaveBeenCalledTimes(2);
  });

  it("returns the full append-only history oldest-first", async () => {
    getEvidenceMock.mockResolvedValue({
      result: [
        { cid: "bafy-v0", created_at: 0 },
        { cid: "bafy-v1", created_at: 1 },
      ],
    });

    const history = await getEvidenceHistory(
      "evidence-service-history",
      "commit-a",
      "Cve",
    );

    expect(history).toEqual([
      { kind: "Cve", cid: "bafy-v0", created_at: 0 },
      { kind: "Cve", cid: "bafy-v1", created_at: 1 },
    ]);
    expect(getEvidenceMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty history when no evidence exists", async () => {
    getEvidenceMock.mockResolvedValue({ result: [] });

    const history = await getEvidenceHistory(
      "evidence-service-history-empty",
      "commit-a",
      "Sbom",
    );

    expect(history).toEqual([]);
  });
});
