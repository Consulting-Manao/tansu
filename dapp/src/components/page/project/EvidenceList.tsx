import { useQueries } from "@tanstack/react-query";
import { evidenceTarget } from "@service/AttestationService";
import { evidenceQuery, type EvidenceKindTag } from "@service/EvidenceService";
import { queryClient } from "@service/queryClient";
import { Button, CopyButton, Spinner } from "components/ui";
import { isValidCommitHash } from "utils/contentHashes";
import { getIpfsUrl } from "utils/ipfsFunctions";
import AttestationCard from "./AttestationCard";

export const EVIDENCE_KINDS: { tag: EvidenceKindTag; label: string }[] = [
  { tag: "Sbom", label: "SBOM" },
  { tag: "Cve", label: "CVE" },
  { tag: "Attestation", label: "Attestation" },
];

/** A commit's evidence, by kind, oldest first, each with its attestations. */
const EvidenceList = ({
  projectName,
  commitHash,
  connectedPublicKey,
  isMaintainer,
}: {
  projectName: string;
  commitHash: string;
  connectedPublicKey: string | null | undefined;
  isMaintainer: boolean;
}) => {
  // One history per kind; a write refetches it.
  const reads = useQueries(
    {
      queries: EVIDENCE_KINDS.map(({ tag }) => ({
        ...evidenceQuery(projectName, commitHash, tag),
        enabled: isValidCommitHash(commitHash),
      })),
    },
    queryClient,
  );
  const evidence = reads.flatMap(({ data }) => data ?? []);
  const loading = reads.some(({ isLoading }) => isLoading);
  const error = reads.find(({ error }) => error)?.error?.message ?? null;

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-4" aria-busy="true">
        <Spinner label="Loading…" className="text-ink" />
        <p className="text-ui text-ink-muted">Loading evidence…</p>
      </div>
    );
  }
  const groups = EVIDENCE_KINDS.map(({ tag, label }) => {
    const items = evidence
      .filter((item) => item.kind === tag)
      .sort((a, b) => Number(a.created_at) - Number(b.created_at));
    if (!items.length) return null;
    return (
      <div key={tag} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-ui font-semibold text-ink">{label}</p>
          <span className="text-label text-ink-muted">({items.length})</span>
        </div>
        <div className="flex flex-col gap-1.5 pl-6">
          {items.map((item, idx) => {
            const ipfsUrl = getIpfsUrl(item.cid);
            const ts = Number(item.created_at);
            const createdAt =
              ts > 0 ? new Date(ts * 1000).toLocaleDateString() : "";
            const isLatest = idx === items.length - 1 && items.length > 1;
            return (
              <div
                key={`${item.kind}-${item.cid}`}
                className={`flex flex-col gap-1 py-1.5 px-3 rounded text-ui ${
                  isLatest
                    ? "bg-accent-soft border border-warning/40"
                    : "bg-sunken"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                  <code className="text-label text-ink-muted break-all font-mono leading-relaxed sm:flex-1 sm:min-w-0">
                    {item.cid}
                  </code>
                  <div className="flex items-center gap-1 sm:gap-2 sm:flex-shrink-0 justify-end sm:justify-start">
                    <CopyButton textToCopy={item.cid} size="sm" />
                    {createdAt && (
                      <span className="text-label text-ink-muted whitespace-nowrap">
                        {createdAt}
                      </span>
                    )}
                    {isLatest && (
                      <span className="text-label font-semibold uppercase text-warning bg-warning-soft px-1.5 py-0.5 rounded">
                        Latest
                      </span>
                    )}
                    <AttestationCard
                      projectName={projectName}
                      commitHash={commitHash}
                      target={evidenceTarget(item.kind, item.cid)}
                      connectedPublicKey={connectedPublicKey}
                      isMaintainer={isMaintainer}
                      variant="compact"
                    />
                    {ipfsUrl ? (
                      <Button
                        tone="secondary"
                        icon={
                          <img
                            src="/icons/ipfs.svg"
                            alt=""
                            className="size-5 shrink-0"
                          />
                        }
                        onClick={() =>
                          window.open(ipfsUrl, "_blank", "noopener")
                        }
                        size="sm"
                      >
                        View IPFS
                      </Button>
                    ) : (
                      <span className="text-label text-danger">
                        Invalid CID
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });
  return (
    <>
      {error && (
        <p className="text-ui text-danger" role="alert">
          {error}
        </p>
      )}
      {!error && !evidence.length && (
        <p className="text-ui text-ink-muted py-2">
          No evidence attached to this commit.
        </p>
      )}
      {groups}
    </>
  );
};

export default EvidenceList;
