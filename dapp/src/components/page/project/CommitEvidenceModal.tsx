/**
 * Commit Evidence Modal
 *
 * Replaces the old LastHashModal. Displays the latest (or manually specified)
 * commit hash along with its on-chain evidence (SBOM, CVE, Attestation)
 * grouped by kind. Maintainers can add new evidence via file upload → IPFS
 * → on-chain set_evidence, and update the commit hash on-chain.
 *
 * Evidence is append-only: no edit or remove functionality.
 */

import { useStore } from "@nanostores/react";
import {
  getLatestCommitData,
  getLatestCommitHash,
} from "@service/RepositoryMetadataService";
import { getProjectHash } from "@service/ReadContractService";
import { loadProjectInfo, loadProjectName } from "@service/StateService";
import { loadedPublicKey } from "@service/walletService";
import { getEvidenceHistory } from "@service/EvidenceService";
import type { CommitEvidence, EvidenceKindTag } from "@service/EvidenceService";
import { getIpfsUrl } from "utils/ipfsFunctions";
import { formatDate } from "utils/formatTimeFunctions";
import { configData as configDataStore, projectInfoLoaded } from "utils/store";
import { toast } from "utils/utils";
import Button from "components/utils/Button";
import CopyButton from "components/utils/CopyButton";
import Modal from "components/utils/Modal";
import { setEvidenceWithIpfsUpload } from "@service/EvidenceUploadFlow";
import { commitHash } from "@service/ContractService";
import { useEffect, useState, useCallback, useRef } from "react";
import { getProject } from "@service/ReadContractService";
import { setProject } from "@service/StateService";

const EVIDENCE_KINDS: { tag: EvidenceKindTag; label: string }[] = [
  { tag: "Sbom", label: "SBOM" },
  { tag: "Cve", label: "CVE" },
  { tag: "Attestation", label: "Attestation" },
];

const CommitEvidenceModal = () => {
  const isProjectInfoLoaded = useStore(projectInfoLoaded);
  const configData = useStore(configDataStore);

  // Modal state
  const [isOpen, setIsOpen] = useState(false);

  // Commit hash state
  const [commitHashValue, setCommitHashValue] = useState("");
  const [commitData, setCommitData] = useState<{
    sha: string;
    html_url: string;
    date: string;
    author: string;
  } | null>(null);
  const [isUpdatingHash, setIsUpdatingHash] = useState(false);

  // Evidence state
  const [evidence, setEvidence] = useState<CommitEvidence[]>([]);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // Add-evidence state
  const [selectedKind, setSelectedKind] = useState<EvidenceKindTag>("Sbom");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastUploadedCid, setLastUploadedCid] = useState<string | null>(null);

  // Derived
  const projectInfo = isProjectInfoLoaded ? loadProjectInfo() : null;
  const projectName = loadProjectName();
  const repositoryUrl =
    configData?.officials?.githubLink || projectInfo?.config?.url;

  const connectedPublicKey = loadedPublicKey();
  const isMaintainer =
    connectedPublicKey && projectInfo
      ? projectInfo.maintainers.includes(connectedPublicKey)
      : false;

  // Track whether hash was manually changed by the user
  const [, setHashManuallyChanged] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const onChainHashRef = useRef("");

  // ── Data loading ────────────────────────────────────────────────────

  const loadCommitData = useCallback(async () => {
    if (!projectName) return;

    // Get the latest commit hash from on-chain
    const latestSha = await getProjectHash();
    if (!latestSha) {
      setCommitHashValue("");
      setCommitData(null);
      return;
    }
    setCommitHashValue(latestSha);
    onChainHashRef.current = latestSha;
    setHashManuallyChanged(false);
    setIsEditing(false);

    // Try to enrich with GitHub metadata
    if (!repositoryUrl) return;
    try {
      const latestCommit = await getLatestCommitData(repositoryUrl, latestSha);
      if (latestCommit) {
        setCommitData({
          sha: latestCommit.sha,
          html_url: latestCommit.html_url || "",
          date: formatDate(latestCommit.commit.committer.date),
          author: latestCommit.commit.author.name,
        });
      }
    } catch {
      // Fall back to showing just the hash
      setCommitData(null);
    }
  }, [projectName, repositoryUrl]);

  const loadEvidence = useCallback(async () => {
    if (!projectName || !commitHashValue.trim()) {
      setEvidence([]);
      return;
    }

    setIsEvidenceLoading(true);
    setEvidenceError(null);
    try {
      // Fetch full append-only history for each evidence kind in parallel
      const historyByKind = await Promise.all(
        EVIDENCE_KINDS.map((kind) =>
          getEvidenceHistory(projectName, commitHashValue, kind.tag).catch(
            () => [] as CommitEvidence[],
          ),
        ),
      );
      const allEvidence = historyByKind.flat();
      setEvidence(allEvidence);
    } catch (err: any) {
      setEvidenceError(err?.message || "Failed to load evidence");
      setEvidence([]);
    } finally {
      setIsEvidenceLoading(false);
    }
  }, [projectName, commitHashValue]);

  // Reload everything when the modal opens
  useEffect(() => {
    if (!isOpen || !isProjectInfoLoaded) return;
    loadCommitData();
  }, [isOpen, isProjectInfoLoaded, loadCommitData]);

  // Reload evidence whenever the commit hash changes
  useEffect(() => {
    if (!isOpen) return;
    loadEvidence();
  }, [isOpen, commitHashValue, loadEvidence]);

  // ── Evidence grouped by kind ────────────────────────────────────────

  const evidenceByKind = EVIDENCE_KINDS.map((kindInfo) => ({
    ...kindInfo,
    items: evidence.filter((e) => e.kind === kindInfo.tag),
  }));

  // ── Add evidence handler ────────────────────────────────────────────

  const handleAddEvidence = async () => {
    if (!projectName) {
      toast.error("Add Evidence", "No project selected.");
      return;
    }
    if (!commitHashValue.trim()) {
      toast.error("Add Evidence", "No commit hash specified.");
      return;
    }
    if (!selectedFile) {
      toast.error("Add Evidence", "Please select a file to upload.");
      return;
    }

    setIsUploading(true);
    try {
      const cid = await setEvidenceWithIpfsUpload(
        projectName,
        commitHashValue,
        selectedKind,
        selectedFile,
      );

      setLastUploadedCid(cid);

      toast.success(
        "Evidence Added",
        `Evidence (${selectedKind}) uploaded and recorded on-chain. CID: ${cid}`,
      );

      // Reset upload form
      setSelectedFile(null);
      setSelectedKind("Sbom");
      // Reset file input value
      const fileInput = document.getElementById(
        "evidence-file-input",
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      // Reload evidence to include the newly added one
      await loadEvidence();
    } catch (err: any) {
      toast.error(
        "Add Evidence",
        err?.message || "Failed to upload evidence. Please try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  // ── Update hash on-chain handler ────────────────────────────────────

  const handleUpdateHash = async () => {
    if (!commitHashValue.trim()) {
      toast.error("Update Hash", "Please enter a commit hash.");
      return;
    }

    setIsUpdatingHash(true);
    try {
      await commitHash(commitHashValue);

      // Refresh project data
      try {
        const project = await getProject();
        if (project && project.name && project.config && project.maintainers) {
          setProject(project);
        }
      } catch (refreshError) {
        if (import.meta.env.DEV)
          console.error("Error refreshing project data:", refreshError);
      }

      toast.success(
        "Hash Updated",
        "Commit hash has been updated on-chain. Evidence will reload.",
      );

      // Reload evidence for the new hash
      await loadEvidence();
      setHashManuallyChanged(false);
      setIsEditing(false);
      onChainHashRef.current = commitHashValue;
    } catch (err: any) {
      toast.error(
        "Update Hash",
        err?.message || "Failed to update commit hash.",
      );
    } finally {
      setIsUpdatingHash(false);
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────

  const handleClose = () => {
    setIsOpen(false);
    setLastUploadedCid(null);
    setSelectedFile(null);
    setHashManuallyChanged(false);
    setIsEditing(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleHashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCommitHashValue(e.target.value);
    setLastUploadedCid(null);
    setHashManuallyChanged(true);
  };

  const handleStartEditing = async () => {
    setIsEditing(true);
    if (repositoryUrl) {
      try {
        const latestHash = await getLatestCommitHash(repositoryUrl);
        if (latestHash) {
          setCommitHashValue(latestHash);
          setHashManuallyChanged(true);
        }
      } catch {
        // Keep current hash if fetch fails
      }
    }
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setCommitHashValue(onChainHashRef.current);
    setHashManuallyChanged(false);
  };

  const handleKindChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedKind(e.target.value as EvidenceKindTag);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger button */}
      <Button
        id="commit-evidence-button"
        icon="/icons/git.svg"
        size="xl"
        type="secondary"
        className="w-full sm:w-auto"
        onClick={handleOpen}
      >
        Code Finality
      </Button>

      {isOpen && (
        <Modal onClose={handleClose}>
          <div className="flex flex-col gap-6 sm:gap-9 min-w-[320px] sm:min-w-[480px] md:min-w-[600px]">
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-start gap-4 sm:gap-[18px]">
              <img
                src="/images/scan.svg"
                className="w-16 h-16 sm:w-auto sm:h-auto flex-shrink-0"
                alt=""
              />
              <div className="flex-grow">
                <h6 className="text-xl sm:text-2xl font-medium text-primary">
                  Code Finality
                </h6>
                <p className="text-sm text-tertiary mt-1">
                  Review evidence (SBOM, CVE, Attestation) linked to the commit
                  hash. Maintainers can add new evidence or update the hash
                  on-chain.
                </p>
              </div>
            </div>

            {/* ── Commit Hash ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-primary">Commit Hash</p>
              <div className="p-2 sm:p-[12px_18px] flex items-center gap-2 sm:gap-[18px] bg-[#FFEFA8] w-full">
                {isMaintainer && isEditing ? (
                  <input
                    type="text"
                    className="flex-1 bg-transparent text-base sm:text-xl text-primary outline-none border-none font-mono"
                    placeholder="Enter commit hash"
                    value={commitHashValue}
                    onChange={handleHashChange}
                  />
                ) : (
                  <p className="flex-1 text-base sm:text-xl text-primary break-all font-mono">
                    {commitHashValue
                      ? isMaintainer
                        ? commitHashValue
                        : `${commitHashValue.slice(0, 24)}…`
                      : "No hash available"}
                  </p>
                )}
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <CopyButton textToCopy={commitHashValue} size="sm" />
                  {commitData?.html_url && (
                    <a
                      className="p-2 hover:bg-gray-100 rounded"
                      href={commitData.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open commit in new tab"
                    >
                      <img
                        src="/icons/link.svg"
                        className="w-4 h-4"
                        alt="Open link"
                      />
                    </a>
                  )}
                  {isMaintainer && (
                    <button
                      type="button"
                      onClick={
                        isEditing ? handleCancelEditing : handleStartEditing
                      }
                      className="p-2 hover:bg-gray-100 rounded transition-colors duration-200"
                      aria-label={
                        isEditing ? "Cancel editing" : "Edit commit hash"
                      }
                    >
                      <img
                        src={
                          isEditing ? "/icons/cancel.svg" : "/icons/edit.svg"
                        }
                        className="w-4 h-4"
                        alt=""
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Commit metadata (date + author) */}
              {commitData && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-1">
                  {commitData.date && (
                    <div className="flex gap-2">
                      <p className="text-sm text-tertiary">Date:</p>
                      <p className="text-sm text-primary font-medium">
                        {commitData.date}
                      </p>
                    </div>
                  )}
                  {commitData.author && (
                    <div className="flex gap-2">
                      <p className="text-sm text-tertiary">Author:</p>
                      <p className="text-sm text-primary font-medium">
                        @{commitData.author}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Update hash button (maintainers only) */}
              {isMaintainer && (
                <div className="flex justify-end mt-1">
                  <Button
                    onClick={handleUpdateHash}
                    isLoading={isUpdatingHash}
                    disabled={isUpdatingHash || !commitHashValue.trim()}
                    size="sm"
                    type="secondary"
                    className="w-full sm:w-auto"
                  >
                    {isUpdatingHash ? "Saving…" : "Save Hash to Chain"}
                  </Button>
                </div>
              )}

              {/* Note for empty hash */}
              {!commitHashValue.trim() && (
                <p className="text-sm text-amber-600">
                  No commit hash found on-chain. Enter a hash manually to view
                  or attach evidence.
                </p>
              )}
            </div>

            {/* ── Evidence Section ────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-primary">Evidence</p>
                <span className="text-xs text-tertiary">(append-only)</span>
              </div>

              {/* Loading state */}
              {isEvidenceLoading && (
                <div className="flex items-center gap-3 py-4" aria-busy="true">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-tertiary">Loading evidence…</p>
                </div>
              )}

              {/* Error state */}
              {evidenceError && !isEvidenceLoading && (
                <p className="text-sm text-red-600" role="alert">
                  {evidenceError}
                </p>
              )}

              {/* Empty state */}
              {!isEvidenceLoading &&
                !evidenceError &&
                evidence.length === 0 && (
                  <p className="text-sm text-tertiary py-2">
                    No evidence attached to this commit.
                  </p>
                )}

              {/* Evidence grouped by kind */}
              {!isEvidenceLoading &&
                evidenceByKind.map(
                  (group) =>
                    group.items.length > 0 && (
                      <div key={group.tag} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-primary">
                            {group.label}
                          </p>
                          <span className="text-xs text-tertiary">
                            ({group.items.length})
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5 pl-6">
                          {group.items
                            .slice() // copy to avoid mutating state
                            .sort(
                              (a, b) =>
                                Number(a.created_at) - Number(b.created_at),
                            )
                            .map((item, idx, sorted) => {
                              const ipfsUrl = getIpfsUrl(item.cid);
                              const ts = Number(item.created_at);
                              const createdAt =
                                ts > 0
                                  ? new Date(ts * 1000).toLocaleDateString()
                                  : "";
                              const isLatest =
                                idx === sorted.length - 1 && sorted.length > 1;
                              return (
                                <div
                                  key={`${item.kind}-${item.cid}`}
                                  className={`flex flex-col gap-1 py-1.5 px-3 rounded text-sm ${
                                    isLatest
                                      ? "bg-[#FFEFA8] border border-yellow-300"
                                      : "bg-zinc-50"
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                                    <code className="text-xs text-secondary break-all font-mono leading-relaxed sm:flex-1 sm:min-w-0">
                                      {item.cid}
                                    </code>
                                    <div className="flex items-center gap-1 sm:gap-2 sm:flex-shrink-0 justify-end sm:justify-start">
                                      <CopyButton
                                        textToCopy={item.cid}
                                        size="sm"
                                      />
                                      {createdAt && (
                                        <span className="text-xs text-tertiary whitespace-nowrap">
                                          {createdAt}
                                        </span>
                                      )}
                                      {isLatest && (
                                        <span className="text-[10px] font-semibold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                          Latest
                                        </span>
                                      )}
                                      {ipfsUrl ? (
                                        <Button
                                          type="secondary"
                                          icon="/icons/ipfs.svg"
                                          onClick={() =>
                                            window.open(ipfsUrl, "_blank")
                                          }
                                          size="sm"
                                        >
                                          View IPFS
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-red-500">
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
                    ),
                )}
            </div>

            {/* ── Add Evidence (maintainers only) ─────────────────────── */}
            {isMaintainer && (
              <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4">
                <p className="text-sm font-semibold text-primary">
                  Add Evidence
                </p>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  {/* Kind selector */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label
                      htmlFor="evidence-kind"
                      className="text-xs text-tertiary font-medium"
                    >
                      Kind
                    </label>
                    <select
                      id="evidence-kind"
                      className="p-2 border border-[#978AA1] outline-none text-sm bg-white"
                      value={selectedKind}
                      onChange={handleKindChange}
                      disabled={isUploading}
                    >
                      {EVIDENCE_KINDS.map((k) => (
                        <option key={k.tag} value={k.tag}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* File picker */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label
                      htmlFor="evidence-file-input"
                      className="text-xs text-tertiary font-medium"
                    >
                      File
                    </label>
                    <input
                      id="evidence-file-input"
                      type="file"
                      className="block w-full text-sm text-secondary
                        file:mr-3 file:py-1.5 file:px-3
                        file:border-0 file:text-sm file:font-medium
                        file:bg-primary file:text-white
                        hover:file:opacity-90 file:cursor-pointer
                        file:transition-opacity"
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />
                  </div>
                </div>

                {/* Upload button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleAddEvidence}
                    isLoading={isUploading}
                    disabled={
                      isUploading || !selectedFile || !commitHashValue.trim()
                    }
                    className="w-full sm:w-auto"
                  >
                    {isUploading ? "Uploading…" : "Add Evidence"}
                  </Button>
                </div>

                {/* Success banner – shown after a CID is uploaded */}
                {lastUploadedCid && !isUploading && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-100 border-2 border-green-400 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-800">
                        Evidence uploaded successfully
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs sm:text-sm font-mono text-green-700 bg-green-50 px-2 py-1 rounded break-all">
                          {lastUploadedCid}
                        </code>
                        <CopyButton textToCopy={lastUploadedCid} size="sm" />
                      </div>
                    </div>
                  </div>
                )}

                {isUploading && (
                  <div className="flex items-center gap-2 text-xs text-tertiary">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Uploading to IPFS and recording on-chain…
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default CommitEvidenceModal;
