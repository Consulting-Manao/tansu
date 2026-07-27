import { useCallback, useEffect, useState } from "react";

import {
  commitTarget,
  getAttestations,
  getAttestationThreshold,
  getCommitFinality,
  type CommitFinality,
} from "@service/AttestationService";
import { attest } from "@service/ContractService";
import type { Attestation } from "../../../../packages/tansu";
import { truncateMiddle, toast } from "utils/utils";
import Button from "components/utils/Button";
import {
  isUiMock,
  MOCK_MAINTAINERS,
  mockAttestations,
  mockFinality,
  mockThreshold,
} from "./attestationMocks";

interface CommitFinalitySectionProps {
  projectName: string | null | undefined;
  commitHash: string;
  isMaintainer: boolean;
  maintainers: string[];
}

const CommitFinalitySection = ({
  projectName,
  commitHash,
  isMaintainer,
  maintainers,
}: CommitFinalitySectionProps) => {
  const [finality, setFinality] = useState<CommitFinality | null>(null);
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAttesting, setIsAttesting] = useState(false);

  const mock = isUiMock();
  const effectiveIsMaintainer = mock || isMaintainer;

  const load = useCallback(async () => {
    if (mock) {
      setFinality(mockFinality);
      setAttestations(mockAttestations);
      setThreshold(mockThreshold);
      return;
    }

    if (!projectName || !commitHash.trim()) {
      setFinality(null);
      setAttestations([]);
      setThreshold(null);
      return;
    }

    setIsLoading(true);
    try {
      const [finalityResult, attestationsResult, thresholdResult] =
        await Promise.all([
          getCommitFinality(projectName, commitHash),
          getAttestations(projectName, commitHash, commitTarget()),
          getAttestationThreshold(projectName),
        ]);
      setFinality(finalityResult);
      setAttestations(attestationsResult);
      setThreshold(thresholdResult);
    } catch {
      setFinality(null);
      setAttestations([]);
      setThreshold(null);
    } finally {
      setIsLoading(false);
    }
  }, [mock, projectName, commitHash]);

  useEffect(() => {
    load();
  }, [load]);

  const connectedMaintainers = new Set(mock ? MOCK_MAINTAINERS : maintainers);

  const handleAttest = async () => {
    if (finality?.isFinal) return;
    if (mock) {
      toast.success("Attestation", "Mock mode — no transaction sent.");
      return;
    }
    if (!projectName || !commitHash.trim()) return;

    setIsAttesting(true);
    try {
      await attest(projectName, commitHash, commitTarget());
      toast.success("Attestation", "Your attestation was recorded on-chain.");
      await load();
    } catch (err: any) {
      toast.error("Attestation", err?.message || "Failed to attest.");
    } finally {
      setIsAttesting(false);
    }
  };

  if (!mock && !commitHash.trim()) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-primary">Finality</p>
        {threshold !== null && (
          <span className="text-xs text-tertiary">
            (needs {threshold}% of maintainers)
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 py-4" aria-busy="true">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-tertiary">Loading attestations…</p>
        </div>
      )}

      {!isLoading && finality && (
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-bold rounded-sm px-1.5 py-0.5 ${
              finality.isFinal
                ? "bg-lime text-primary"
                : "bg-zinc-200 text-secondary"
            }`}
          >
            {finality.percent}% attested
            {finality.isFinal ? " · Finalized ✓" : ""}
          </span>
          <span className="text-xs text-tertiary">
            {finality.attested} of {finality.total} maintainers
          </span>
        </div>
      )}

      {!isLoading && attestations.length > 0 && (
        <div className="flex flex-col gap-1">
          {attestations.map((a) => (
            <div key={a.attester} className="flex items-center gap-2">
              <span className="text-sm text-primary font-mono">
                {truncateMiddle(a.attester, 12)}
              </span>
              {connectedMaintainers.has(a.attester) && (
                <span className="text-xs font-medium bg-lime px-1 rounded-sm">
                  maintainer
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && attestations.length === 0 && (
        <p className="text-sm text-tertiary py-2">
          No attestations for this commit yet.
        </p>
      )}

      <div className="flex flex-col items-end gap-1">
        <Button
          onClick={handleAttest}
          isLoading={isAttesting}
          disabled={
            isAttesting || !effectiveIsMaintainer || !!finality?.isFinal
          }
          size="sm"
          type="secondary"
          className="w-full sm:w-auto"
          {...(finality?.isFinal
            ? { title: "This commit is already finalized." }
            : effectiveIsMaintainer
              ? {}
              : { title: "Only project maintainers can attest commits." })}
        >
          {finality?.isFinal
            ? "Finalized"
            : isAttesting
              ? "Attesting…"
              : "Attest this commit"}
        </Button>
        {finality?.isFinal ? (
          <p className="text-xs text-tertiary">
            This commit is finalized; no further attestations are needed.
          </p>
        ) : (
          !effectiveIsMaintainer && (
            <p className="text-xs text-tertiary">
              Only maintainers can attest commits.
            </p>
          )
        )}
      </div>
    </div>
  );
};

export default CommitFinalitySection;
