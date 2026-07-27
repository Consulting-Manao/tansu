import { useStore } from "@nanostores/react";
import { getLatestCommitData } from "@service/RepositoryMetadataService";
import { getProjectHash } from "@service/ReadContractService";
import { loadProjectInfo, loadProjectName } from "@service/StateService";
import {
  commitTarget,
  getAttestationThreshold,
  getCommitFinality,
  type CommitFinality,
} from "@service/AttestationService";
import { attest } from "@service/ContractService";
import { loadedPublicKey } from "@service/walletService";
import Tooltip from "components/utils/Tooltip";
import Button from "components/utils/Button";
import CopyButton from "components/utils/CopyButton";
import { useEffect, useState } from "react";
import { formatDate } from "utils/formatTimeFunctions";
import { toast } from "utils/utils";
import {
  configData as configDataStore,
  projectHasSubProjects,
  projectInfoLoaded,
} from "utils/store";
import { getIpfsBasicLink } from "utils/ipfsFunctions";
import { isUiMock, mockFinality, mockThreshold } from "./attestationMocks";

enum Status {
  Match,
  NotMatch,
  NotFound,
}

const LatestCommit = () => {
  const isProjectInfoLoaded = useStore(projectInfoLoaded);
  const hasSubProjects = useStore(projectHasSubProjects);
  const configData = useStore(configDataStore);

  // configData is undefined until the TOML/IPFS fetch completes
  const configLoaded = configData !== undefined;
  // Only treat as software when configData has loaded AND projectType is SOFTWARE
  const isSoftwareProject =
    configLoaded && configData?.projectType === "SOFTWARE";

  const [commitData, setCommitData] = useState<{
    sha: string;
    commit: {
      message: string;
      author: { name: string };
      committer: { date: string };
    };
    html_url?: string;
  } | null>(null);
  const [latestCommitStatus, setLatestCommitStatus] = useState<Status>(
    Status.NotFound,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Attestation state for the commit hash currently registered on-chain
  const [onChainSha, setOnChainSha] = useState<string | null>(null);
  const [finality, setFinality] = useState<CommitFinality | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [isAttesting, setIsAttesting] = useState(false);
  const [hasAttested, setHasAttested] = useState(false);

  const connectedPublicKey = loadedPublicKey();
  const canAttest =
    isUiMock() ||
    (connectedPublicKey
      ? (loadProjectInfo()?.maintainers?.includes(connectedPublicKey) ?? false)
      : false);

  const loadFinality = async (sha: string) => {
    if (isUiMock()) {
      setFinality(mockFinality);
      setThreshold(mockThreshold);

      return;
    }

    const projectName = loadProjectName();

    if (!projectName || !sha) {
      return;
    }

    try {
      const [finalityResult, thresholdResult] = await Promise.all([
        getCommitFinality(projectName, sha),
        getAttestationThreshold(projectName),
      ]);

      setFinality(finalityResult);
      setThreshold(thresholdResult);
    } catch {
      setFinality(null);
      setThreshold(null);
    }
  };

  const handleAttest = async () => {
    if (!onChainSha || finality?.isFinal) {
      return;
    }

    if (isUiMock()) {
      setFinality(mockFinality);
      setHasAttested(true);

      return;
    }

    const projectName = loadProjectName();

    if (!projectName) {
      return;
    }

    setIsAttesting(true);
    try {
      await attest(projectName, onChainSha, commitTarget());
      await loadFinality(onChainSha);

      setHasAttested(true);
    } catch (err: any) {
      toast.error("Attestation", err?.message ?? "Failed to attest.");
    } finally {
      setIsAttesting(false);
    }
  };

  const loadLatestCommitData = async () => {
    if (!isSoftwareProject) {
      setIsLoading(false);
      return;
    }

    setLoadError(null);
    setIsLoading(true);
    setHasAttested(false);

    const projectInfo = loadProjectInfo();
    const latestSha = await getProjectHash();

    setOnChainSha(latestSha ?? null);

    if (latestSha) {
      loadFinality(latestSha);
    }

    const repositoryUrl =
      configData?.officials?.githubLink || projectInfo?.config?.url;
    if (projectInfo && projectInfo.config && repositoryUrl && latestSha) {
      try {
        const latestCommit = await getLatestCommitData(
          repositoryUrl,
          latestSha,
        );

        if (latestCommit) {
          setCommitData(latestCommit);
          setLatestCommitStatus(
            latestCommit.sha === latestSha ? Status.Match : Status.NotMatch,
          );
        }
      } catch {
        setLoadError("Could not load commit data.");
      }
    }
    setIsLoading(false);
    setLatestCommitStatus(Status.NotFound);
  };

  useEffect(() => {
    if (!configLoaded) return;
    loadLatestCommitData();
  }, [isProjectInfoLoaded, isSoftwareProject, configLoaded]);

  const configCid = loadProjectInfo()?.config?.ipfs;
  const tomlLink =
    configCid && getIpfsBasicLink(configCid) ? (
      <a
        href={`${getIpfsBasicLink(configCid)}/tansu.toml`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[#07711E] hover:underline"
      >
        <img src="/icons/ipfs.svg" className="w-4 h-4" alt="" />
        <span className="text-base">tansu.toml</span>
      </a>
    ) : null;

  // Don't render anything until we know the project type
  if (!configLoaded) return null;

  if (hasSubProjects) {
    return <div className="flex flex-col gap-3">{tomlLink}</div>;
  }

  // Non-software: render nothing (tomlLink is shown in the sync status section instead)
  if (!isSoftwareProject) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <p className="text-base text-tertiary">Loading latest commit…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {commitData && (
        <div className="flex gap-2">
          <p className="text-base text-tertiary">Latest Commit:</p>
          <p className="text-base font-bold text-primary">
            {commitData?.commit.message}
          </p>
        </div>
      )}
      <div className="flex gap-[18px]">
        {commitData && (
          <div className="p-[8px_18px] flex items-center gap-[18px] bg-[#FFEFA8]">
            <p className="text-lg text-primary">
              {commitData?.sha.slice(0, 9)}
            </p>
            <div className="flex gap-2">
              <CopyButton
                textToCopy={commitData?.html_url || commitData?.sha || ""}
                size="sm"
              />
              {commitData?.html_url ? (
                <a
                  href={commitData.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-gray-100 p-1 rounded transition-colors duration-200"
                >
                  <img src="/icons/link.svg" alt="Open link" />
                </a>
              ) : null}
            </div>
          </div>
        )}
        <div className="flex gap-[18px]">
          <div className="flex items-center gap-2">
            <div className="flex gap-[6px]">
              {latestCommitStatus == Status.Match ? (
                <img src="/icons/check.svg" alt="" />
              ) : (
                <img src="/icons/failed.svg" alt="" />
              )}
              <p className="text-base text-medium text-[#07711E]">
                Commit Hash
              </p>
            </div>
            <Tooltip
              text={
                latestCommitStatus == Status.Match
                  ? "Latest SHA on-chain exists in Git history"
                  : "Latest SHA on-chain cannot be found in Git history"
              }
            >
              <img src="/icons/info.svg" alt="" />
            </Tooltip>
          </div>

          {finality && (
            <div className="flex items-center gap-2">
              {canAttest && !finality.isFinal && !hasAttested ? (
                <Button
                  onClick={handleAttest}
                  isLoading={isAttesting}
                  disabled={isAttesting}
                  size="sm"
                  type="secondary"
                >
                  {isAttesting ? "Attesting…" : "Attest"}
                </Button>
              ) : (
                <span
                  className={`text-xs font-bold rounded-sm px-1.5 py-1 ${
                    finality.isFinal
                      ? "bg-lime text-primary"
                      : "bg-zinc-200 text-secondary"
                  }`}
                >
                  {finality.percent}% attested
                  {finality.isFinal ? " · Final" : ""}
                </span>
              )}
              <Tooltip
                text={
                  `${finality.attested} of ${finality.total} maintainers attested this commit` +
                  (threshold !== null
                    ? ` · ${threshold}% needed for finality`
                    : "")
                }
              >
                <img src="/icons/info.svg" alt="" />
              </Tooltip>
            </div>
          )}
        </div>
      </div>
      {commitData && (
        <div className="flex gap-3">
          <p className="text-base font-semibold text-primary">
            @{commitData?.commit.author.name}
          </p>
          <p className="text-base text-primary">committed on</p>
          <p className="text-base font-semibold text-primary">
            {formatDate(commitData?.commit.committer.date)}
          </p>
        </div>
      )}
      {loadError && (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      )}
      {tomlLink}
    </div>
  );
};

export default LatestCommit;
