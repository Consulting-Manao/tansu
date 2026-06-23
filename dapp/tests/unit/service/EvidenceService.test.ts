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

  it("returns all existing evidence for a commit and omits missing kinds", async () => {
    getEvidenceMock.mockImplementation(
      ({ kind }: { kind: { tag: string } }) => {
        if (kind.tag === "Attestation") {
          return Promise.resolve({
            simulation: {
              error: "HostError: Error(Contract, #304)",
            },
          });
        }

        return Promise.resolve({
          result: {
            cid: `bafy-${kind.tag.toLowerCase()}`,
            created_at: 42,
          },
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

  it("returns null when one evidence kind is missing", async () => {
    getEvidenceMock.mockResolvedValue({
      simulation: {
        error: "HostError: Error(Contract, #304)",
      },
    });

    await expect(
      getEvidenceByKind("evidence-service-missing", "commit-a", "Sbom"),
    ).resolves.toBeNull();
  });

  it("deduplicates concurrent lookups for the same project commit and kind", async () => {
    const deferred = createDeferred<{
      result: { cid: string; created_at: number };
    }>();
    getEvidenceMock.mockReturnValue(deferred.promise);

    const projectKey = Buffer.from("1234", "hex");
    const first = getEvidenceByKind(projectKey, "commit-a", "Sbom");
    const second = getEvidenceByKind(projectKey, "commit-a", "Sbom");

    expect(getEvidenceMock).toHaveBeenCalledTimes(1);

    deferred.resolve({
      result: {
        cid: "bafy-deduped",
        created_at: 1,
      },
    });

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
      .mockResolvedValueOnce({
        result: {
          cid: "bafy-old",
          created_at: 1,
        },
      })
      .mockResolvedValueOnce({
        result: {
          cid: "bafy-new",
          created_at: 2,
        },
      });

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
});
