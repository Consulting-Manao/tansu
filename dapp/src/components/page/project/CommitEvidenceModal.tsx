import { useStore } from "@nanostores/react";
import { useState } from "react";
import { Button, Dialog } from "components/ui";
import type { ConfigData } from "types/projectConfig";
import { connectedPublicKey as connectedPublicKeyStore } from "utils/store";
import type { Project } from "../../../../packages/tansu";
import AddEvidenceForm from "./AddEvidenceForm";
import AttestationCard from "./AttestationCard";
import CommitHashSection from "./CommitHashSection";
import EvidenceList from "./EvidenceList";
import { useCommitHash } from "./useCommitHash";

/**
 * Code finality: the commit on chain (or one a maintainer enters), its
 * attestations, and its evidence (SBOM, CVE, attestation files on IPFS), by
 * kind. Maintainers add evidence and save the hash on chain. Evidence is
 * append-only: nothing is edited or removed.
 */
const CommitEvidenceModal = ({
  project,
  config,
}: {
  project: Project;
  config: ConfigData;
}) => {
  const [open, setOpen] = useState(false);
  const projectName = project.name;
  const commit = useCommitHash(
    projectName,
    config.officials.githubLink || project.config.url,
    open,
  );
  const connectedPublicKey = useStore(connectedPublicKeyStore);
  const isMaintainer =
    !!connectedPublicKey && project.maintainers.includes(connectedPublicKey);

  return (
    <>
      <Button
        id="commit-evidence-button"
        tone="secondary"
        onClick={() => setOpen(true)}
      >
        Code Finality
      </Button>

      {open && (
        <Dialog size="auto" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-6 sm:gap-9 min-w-80 sm:min-w-120 md:min-w-150">
            <div className="flex items-start gap-4 sm:gap-4">
              <img
                src="/images/scan.svg"
                className="w-16 h-16 sm:w-auto sm:h-auto flex-shrink-0"
                alt=""
              />
              <div className="flex-grow">
                <h6 className="text-lead sm:text-section font-medium text-ink">
                  Code Finality
                </h6>
                <p className="text-ui text-ink-muted mt-1">
                  Review evidence (SBOM, CVE, Attestation) linked to the commit
                  hash. Maintainers can add new evidence or update the hash
                  on-chain.
                </p>
              </div>
            </div>

            <CommitHashSection commit={commit} isMaintainer={isMaintainer} />

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <p className="text-ui font-semibold text-ink">Evidence</p>
                <span className="text-label text-ink-muted">(append-only)</span>
              </div>
              {commit.hash.trim() && (
                <div className="py-2 border-t border-line">
                  <AttestationCard
                    projectName={projectName}
                    commitHash={commit.hash}
                    maintainers={project.maintainers}
                    connectedPublicKey={connectedPublicKey}
                    isMaintainer={isMaintainer}
                    showThreshold
                  />
                </div>
              )}
              <EvidenceList
                projectName={projectName}
                commitHash={commit.hash}
                connectedPublicKey={connectedPublicKey}
                isMaintainer={isMaintainer}
              />
            </div>

            {isMaintainer && (
              <AddEvidenceForm
                projectName={projectName}
                commitHash={commit.hash}
              />
            )}
          </div>
        </Dialog>
      )}
    </>
  );
};

export default CommitEvidenceModal;
