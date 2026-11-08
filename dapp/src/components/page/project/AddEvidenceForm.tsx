import { useEffect, useState } from "react";
import { setEvidence, type EvidenceKindTag } from "@service/EvidenceService";
import { Button, CopyButton, Select, Spinner } from "components/ui";
import { toast } from "utils/utils";
import { EVIDENCE_KINDS } from "./EvidenceList";

/**
 * For maintainers: attach a file to the commit as evidence, uploaded to IPFS
 * and recorded on chain. Evidence is append-only.
 */
const AddEvidenceForm = ({
  projectName,
  commitHash,
}: {
  projectName: string;
  commitHash: string;
}) => {
  const [kind, setKind] = useState<EvidenceKindTag>("Sbom");
  const [file, setFile] = useState<File | null>(null);
  // Remounted to clear the file input once a file landed.
  const [inputKey, setInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadedCid, setUploadedCid] = useState<string | null>(null);
  // The banner belongs to the commit it was added to.
  useEffect(() => setUploadedCid(null), [commitHash]);

  const add = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const cid = await setEvidence(projectName, commitHash, kind, file);
      setUploadedCid(cid);
      toast.success(
        "Evidence Added",
        `Evidence (${kind}) uploaded and recorded on-chain. CID: ${cid}`,
      );
      setFile(null);
      setKind("Sbom");
      setInputKey((key) => key + 1);
    } catch (err: any) {
      toast.error(
        "Add Evidence",
        err?.message || "Failed to upload evidence. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      <p className="text-ui font-semibold text-ink">Add Evidence</p>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1">
          <Select
            label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as EvidenceKindTag)}
            disabled={uploading}
          >
            {EVIDENCE_KINDS.map((k) => (
              <option key={k.tag} value={k.tag}>
                {k.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label
            htmlFor="evidence-file-input"
            className="text-label text-ink-muted font-medium"
          >
            File
          </label>
          <input
            key={inputKey}
            id="evidence-file-input"
            type="file"
            className="block w-full text-ui text-ink-muted
              file:mr-3 file:py-1.5 file:px-3
              file:border-0 file:text-ui file:font-medium
              file:bg-action file:text-on-action
              hover:file:opacity-90 file:cursor-pointer
              file:transition-opacity"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={uploading}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={add}
          loading={uploading}
          disabled={uploading || !file || !commitHash.trim()}
          className="w-full sm:w-auto"
        >
          {uploading ? "Uploading…" : "Add Evidence"}
        </Button>
      </div>

      {uploadedCid && !uploading && (
        <div className="flex items-center gap-3 px-4 py-3 bg-success-soft border-2 border-success/40 rounded-control">
          <div className="w-8 h-8 rounded-full bg-success flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-surface"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <p className="text-ui font-semibold text-success">
              Evidence uploaded successfully
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-label sm:text-ui font-mono text-success bg-success-soft px-2 py-1 rounded break-all">
                {uploadedCid}
              </code>
              <CopyButton textToCopy={uploadedCid} size="sm" />
            </div>
          </div>
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 text-label text-ink-muted">
          <Spinner label="Loading…" className="text-ink" />
          Uploading to IPFS and recording on-chain…
        </div>
      )}
    </div>
  );
};

export default AddEvidenceForm;
