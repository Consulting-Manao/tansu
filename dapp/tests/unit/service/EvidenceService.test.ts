import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getEvidenceMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/contracts/soroban_tansu", () => ({
  tansuReads: { get_evidence: getEvidenceMock },
}));

import { evidenceQuery } from "../../../src/service/EvidenceService";

describe("evidenceQuery", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient();
  });

  it("reads one kind's history, oldest first, tagged with its kind", async () => {
    getEvidenceMock.mockResolvedValue({
      result: [
        { cid: "bafy-v0", created_at: 0n },
        { cid: "bafy-v1", created_at: 1n },
      ],
    });

    await expect(
      client.query(evidenceQuery("demo", "commit-a", "Cve")),
    ).resolves.toEqual([
      { kind: "Cve", cid: "bafy-v0", created_at: 0n },
      { kind: "Cve", cid: "bafy-v1", created_at: 1n },
    ]);
    expect(getEvidenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commit_hash: "commit-a",
        kind: { tag: "Cve", values: undefined },
      }),
    );
  });

  it("fails on a contract error instead of reading as no evidence", async () => {
    getEvidenceMock.mockResolvedValue({
      result: undefined,
      simulation: { error: "HostError: Error(Contract, #0)" },
    });

    await expect(
      client.query(evidenceQuery("demo", "commit-a", "Sbom")),
    ).rejects.toThrow();
  });
});
