import { useCallback, useEffect, useState } from "react";

import {
  commitTarget,
  getAttestations,
  getAttestationThreshold,
  getCommitFinality,
  type CommitFinality,
} from "@service/AttestationService";
import { attest, revokeAttestation } from "@service/ContractService";
import type {
  Attestation,
  AttestationTarget,
} from "../../../../packages/tansu";
import { isAttestationRevocable } from "constants/attestation";
import { truncateMiddle, toast } from "utils/utils";
import Button from "components/utils/Button";

interface AttestationCardProps {
  projectName: string | null | undefined;
  commitHash: string;
  /** Defaults to the commit itself; pass `evidenceTarget(kind, cid)` for an artifact. */
  target?: AttestationTarget;
  /** Current maintainers, used to badge attesters. */
  maintainers?: string[];
  /** Connected wallet; drives "is this mine" and permission checks. */
  connectedPublicKey?: string | null | undefined;
  /** Whether the connected wallet may attest. */
  isMaintainer?: boolean;
  /** `compact` renders a single inline control for list rows. */
  variant?: "full" | "compact";
  /** Show the project's finality threshold alongside the status. */
  showThreshold?: boolean;
  /** Called after any successful on-chain change. */
  onChanged?: () => void;
}

const AttestationCard = ({
  projectName,
  commitHash,
  target,
  maintainers = [],
  connectedPublicKey,
  isMaintainer = false,
  variant = "full",
  showThreshold = false,
  onChanged,
}: AttestationCardProps) => {
  const resolvedTarget = target ?? commitTarget();

  const [finality, setFinality] = useState<CommitFinality | null>(null);
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAttesting, setIsAttesting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  const targetKey =
    resolvedTarget.tag === "Commit"
      ? "Commit"
      : `${resolvedTarget.values[0].tag}:${resolvedTarget.values[1]}`;

  const load = useCallback(async () => {
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
          getCommitFinality(projectName, commitHash, resolvedTarget),
          getAttestations(projectName, commitHash, resolvedTarget),
          showThreshold
            ? getAttestationThreshold(projectName)
            : Promise.resolve(null),
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
    // targetKey stands in for resolvedTarget, which is a fresh object each render
  }, [projectName, commitHash, targetKey, showThreshold]);

  useEffect(() => {
    load();
  }, [load]);

  const ownAttestation = connectedPublicKey
    ? attestations.find((a) => a.attester === connectedPublicKey)
    : undefined;
  const hasAttested = !!ownAttestation;
  const isFinal = !!finality?.isFinal;
  const canRevoke =
    !!ownAttestation &&
    isAttestationRevocable(ownAttestation.created_at, isFinal);
  const canAttest = isMaintainer && !isFinal && !hasAttested;

  const maintainerSet = new Set(maintainers);

  const afterChange = async () => {
    await load();
    onChanged?.();
  };

  const handleAttest = async () => {
    if (!projectName || !canAttest) return;

    setIsAttesting(true);
    try {
      await attest(projectName, commitHash, resolvedTarget);
      toast.success("Attestation", "Your attestation was recorded on-chain.");
      await afterChange();
    } catch (err: any) {
      toast.error("Attestation", err?.message || "Failed to attest.");
    } finally {
      setIsAttesting(false);
    }
  };

  const handleRevoke = async () => {
    if (!projectName || !canRevoke) return;

    setIsRevoking(true);
    try {
      await revokeAttestation(projectName, commitHash, resolvedTarget);
      toast.success("Attestation", "Your attestation was withdrawn.");
      await afterChange();
    } catch (err: any) {
      toast.error("Attestation", err?.message || "Failed to withdraw.");
    } finally {
      setIsRevoking(false);
    }
  };

  if (!commitHash.trim()) return null;

  const badge = finality ? (
    <span
      className={`flex items-center justify-center text-xs font-bold rounded-sm px-1.5 py-0.5 whitespace-nowrap ${
        isFinal ? "bg-green-100 text-green-700" : "bg-zinc-200 text-secondary"
      }`}
      title={`${finality.attested} of ${finality.total} maintainers attested`}
    >
      {finality.percent}% attested{isFinal ? " · Final" : ""}
    </span>
  ) : null;

  // ── Compact: one control for list rows ──────────────────────────────
  if (variant === "compact") {
    if (isLoading) return null;

    if (canAttest) {
      return (
        <button
          onClick={handleAttest}
          disabled={isAttesting}
          className="text-xs font-medium px-1.5 py-0.5 rounded-sm border border-zinc-300 text-primary hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap"
          title="Attest this target"
        >
          {isAttesting ? "Attesting…" : "Attest"}
        </button>
      );
    }

    if (canRevoke) {
      return (
        <div className="flex items-center gap-1">
          {badge}
          <button
            onClick={handleRevoke}
            disabled={isRevoking}
            className="text-xs font-medium px-1.5 py-0.5 rounded-sm border border-zinc-300 text-primary hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap"
            title="Withdraw your attestation"
          >
            {isRevoking ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      );
    }

    return badge;
  }

  // ── Full card ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Code Finality: status and the attest/withdraw action */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex flex-row items-center gap-1">
            <p className="text-sm font-semibold text-primary">Code Finality</p>
            {showThreshold && threshold !== null && (
              <span className="text-xs text-tertiary">
                (needs {threshold}% of maintainers)
              </span>
            )}

            {!isLoading && finality && (
              <div className="flex items-center gap-3">
                {badge}
                <span className="text-xs text-tertiary">
                  {finality.attested} of {finality.total} maintainers
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAttest}
                isLoading={isAttesting}
                disabled={isAttesting || !canAttest}
                size="sm"
                type="secondary"
              >
                {isFinal
                  ? "Finalized"
                  : hasAttested
                    ? "Attested ✓"
                    : isAttesting
                      ? "Attesting…"
                      : "Attest"}
              </Button>
              {canRevoke && (
                <Button
                  onClick={handleRevoke}
                  isLoading={isRevoking}
                  disabled={isRevoking}
                  size="sm"
                  type="secondary"
                >
                  {isRevoking ? "Withdrawing…" : "Withdraw"}
                </Button>
              )}
            </div>

            {isFinal ? (
              <p className="text-xs text-tertiary">
                Finalized; attestations can no longer be withdrawn.
              </p>
            ) : hasAttested && !canRevoke ? (
              <p className="text-xs text-tertiary">
                You attested this. The withdrawal window has closed, so it is
                now permanent.
              </p>
            ) : hasAttested ? (
              <p className="text-xs text-tertiary">
                You attested this. Withdraw within 24h to change your mind.
              </p>
            ) : (
              !isMaintainer && (
                <p className="text-xs text-tertiary">
                  Only maintainers can attest.
                </p>
              )
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-3 py-1" aria-busy="true">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-tertiary">Loading attestations…</p>
          </div>
        )}
      </div>

      {/* Attesters, stacked below */}
      {!isLoading && (
        <div className="flex flex-col gap-1">
          {attestations.length > 0 ? (
            attestations.map((a) => (
              <div key={a.attester} className="flex items-center gap-2">
                <span className="text-sm text-primary font-mono">
                  {truncateMiddle(a.attester, 12)}
                </span>
                {maintainerSet.has(a.attester) && (
                  <span className="text-xs font-medium bg-zinc-200 text-zinc-700 px-1 rounded-sm">
                    maintainer
                  </span>
                )}
                {a.attester === connectedPublicKey && (
                  <span className="text-xs text-tertiary">(you)</span>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-tertiary">No attestations yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AttestationCard;
