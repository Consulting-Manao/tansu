import type { Attestation } from "../../../../packages/tansu";
import type { CommitEvidence } from "@service/EvidenceService";
import type { CommitFinality } from "@service/AttestationService";

export function isUiMock(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("mock");
}

export const MOCK_COMMIT_SHA = "6663520bd9e6ede248fef8157b2af0b6b6b41046";

const MOCK_ALICE = "GALICEXAMPLE7A6WQORTHDVXNH3WQ4XYZ4B2LMNOPQRSTUVWX3YZ4AB5C";
const MOCK_BOB = "GBOBEXAMPLE9C8XRPUSIEWYOI4APR5YZ4C3MNOPQRSTUVWX3YZ4AB5C6D";
const MOCK_CAROL = "GCAROLEXAMPLE1D2ETQVTJFXZPJ5BQS6ZA4D4NOPQRSTUVWX3YZ4AB7E";

export const MOCK_MAINTAINERS = [MOCK_ALICE, MOCK_BOB, MOCK_CAROL];

export const mockAttestations: Attestation[] = [
  {
    attester: MOCK_ALICE,
    created_at: 1_721_800_000n,
    note: undefined,
    weight: 10_000_000,
  },
  {
    attester: MOCK_BOB,
    created_at: 1_721_804_200n,
    note: undefined,
    weight: 5_000_000,
  },
];

export const mockFinality: CommitFinality = {
  attested: 2,
  total: 3,
  percent: 67,
  isFinal: true,
};

export const mockThreshold = 66;

export const mockEvidence: CommitEvidence[] = [
  {
    kind: "Sbom",
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    created_at: 1_721_803_000n,
  },
  {
    kind: "Cve",
    cid: "bafybeic6a4h2k4rjxqz3xh4b3wq2z6f7l5m2n3o4p5q6r7s8t9u0v1w2x3",
    created_at: 1_721_803_600n,
  },
  {
    kind: "Attestation",
    cid: "bafybeih7q3l5m2n3o4p5q6r7s8t9u0v1w2x3y4z5a6b7c8d9e0f1g2h3i4",
    created_at: 1_721_804_000n,
  },
];
