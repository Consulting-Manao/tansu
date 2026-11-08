import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  attest,
  attestationsQuery,
  commitTarget,
  finalityQuery,
  revokeAttestation,
  thresholdQuery,
} from "@service/AttestationService";
import { queryClient } from "@service/queryClient";
import type { AttestationTarget } from "../../../../packages/tansu";
import { isAttestationRevocable } from "constants/attestation";
import { truncateMiddle, toast } from "utils/utils";
import { Button, Spinner } from "components/ui";

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
  const name = projectName ?? "";
  const enabled = !!name && !!commitHash.trim();

  const finalityRead = useQuery(
    { ...finalityQuery(name, commitHash, resolvedTarget), enabled },
    queryClient,
  );
  const attestationsRead = useQuery(
    { ...attestationsQuery(name, commitHash, resolvedTarget), enabled },
    queryClient,
  );
  const thresholdRead = useQuery(
    { ...thresholdQuery(name), enabled: enabled && showThreshold },
    queryClient,
  );
  const finality = finalityRead.data ?? null;
  const attestations = attestationsRead.data ?? [];
  const threshold = thresholdRead.data ?? null;
  const isLoading = finalityRead.isLoading || attestationsRead.isLoading;

  const [isAttesting, setIsAttesting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

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

  const hasCounts =
    !!finality &&
    Number.isFinite(finality.attested) &&
    Number.isFinite(finality.total) &&
    finality.total > 0;

  const handleAttest = async () => {
    if (!projectName || !canAttest) return;

    setIsAttesting(true);
    try {
      await attest(projectName, commitHash, resolvedTarget);
      toast.success("Attestation", "Your attestation was recorded on-chain.");
      onChanged?.();
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
      onChanged?.();
    } catch (err: any) {
      toast.error("Attestation", err?.message || "Failed to withdraw.");
    } finally {
      setIsRevoking(false);
    }
  };

  if (!commitHash.trim()) return null;

  const badge = finality ? (
    <span
      className={`flex items-center justify-center text-xs font-bold rounded-control px-1.5 py-0.5 whitespace-nowrap ${
        isFinal ? "bg-success-soft text-success" : "bg-line text-ink-muted"
      }`}
      title={
        hasCounts
          ? `${finality.attested} of ${finality.total} maintainers attested`
          : `${attestations.length} attested`
      }
    >
      {hasCounts ? `${finality.percent}%` : attestations.length} attested
      {isFinal ? " · Final" : ""}
    </span>
  ) : null;

  // ── Compact: one control for list rows ──────────────────────────────
  if (variant === "compact") {
    if (isLoading) return null;

    if (canAttest) {
      return (
        <div className="flex items-center gap-1">
          {badge}
          <Button
            tone="secondary"
            size="sm"
            onClick={handleAttest}
            loading={isAttesting}
            title="Attest this target"
          >
            Attest
          </Button>
        </div>
      );
    }

    if (canRevoke) {
      return (
        <div className="flex items-center gap-1">
          {badge}
          <Button
            tone="secondary"
            size="sm"
            onClick={handleRevoke}
            loading={isRevoking}
            title="Withdraw your attestation"
          >
            Withdraw
          </Button>
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
            <p className="text-sm font-semibold text-ink">Code Finality</p>
            {showThreshold && threshold !== null && (
              <span className="text-xs text-ink-muted">
                (needs {threshold}% of maintainers)
              </span>
            )}

            {!isLoading && finality && (
              <div className="flex items-center gap-3">
                {badge}
                {hasCounts && (
                  <span className="text-xs text-ink-muted">
                    {finality.attested} of {finality.total} maintainers
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAttest}
                loading={isAttesting}
                disabled={isAttesting || !canAttest}
                size="sm"
                tone="secondary"
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
                  loading={isRevoking}
                  disabled={isRevoking}
                  size="sm"
                  tone="secondary"
                >
                  {isRevoking ? "Withdrawing…" : "Withdraw"}
                </Button>
              )}
            </div>

            {isFinal ? (
              <p className="text-xs text-ink-muted">
                Finalized; attestations can no longer be withdrawn.
              </p>
            ) : hasAttested && !canRevoke ? (
              <p className="text-xs text-ink-muted">
                You attested this. The withdrawal window has closed, so it is
                now permanent.
              </p>
            ) : hasAttested ? (
              <p className="text-xs text-ink-muted">
                You attested this. Withdraw within 24h to change your mind.
              </p>
            ) : (
              !isMaintainer && (
                <p className="text-xs text-ink-muted">
                  Only maintainers can attest.
                </p>
              )
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-3 py-1" aria-busy="true">
            <Spinner label="Loading…" className="text-ink" />
            <p className="text-sm text-ink-muted">Loading attestations…</p>
          </div>
        )}
      </div>

      {/* Attesters, stacked below */}
      {!isLoading && (
        <div className="flex flex-col gap-1">
          {attestations.length > 0 ? (
            <>
              <p className="text-sm font-semibold text-ink">
                Attested by ({attestations.length})
              </p>
              {attestations.map((a) => (
                <div key={a.attester} className="flex items-center gap-2">
                  <span className="text-sm text-ink font-mono">
                    {truncateMiddle(a.attester, 12)}
                  </span>
                  {maintainerSet.has(a.attester) && (
                    <span className="text-xs font-medium bg-line text-ink px-1 rounded-control">
                      maintainer
                    </span>
                  )}
                  {a.attester === connectedPublicKey && (
                    <span className="text-xs text-ink-muted">(you)</span>
                  )}
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-ink-muted">No attestations yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AttestationCard;
