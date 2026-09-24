import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { getLatestCommitData } from "@service/RepositoryMetadataService";
import { commitQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import AttestationCard from "./AttestationCard";
import Tooltip from "components/utils/Tooltip";
import CopyButton from "components/utils/CopyButton";
import { useEffect, useState, type ReactNode } from "react";
import type { Project } from "../../../../packages/tansu";
import type { ConfigData } from "types/projectConfig";
import { formatDate } from "utils/formatTimeFunctions";
import { connectedPublicKey } from "utils/store";

enum Status {
  Match,
  NotMatch,
  NotFound,
}

/** The commit a maintainer set on chain, checked against the repository. */
const LatestCommit = ({
  project,
  config,
  isOrganization,
  tomlLink,
}: {
  project: Project;
  config: ConfigData;
  isOrganization: boolean;
  tomlLink: ReactNode;
}) => {
  const publicKey = useStore(connectedPublicKey);
  const isMaintainer = !!publicKey && project.maintainers.includes(publicKey);
  const onChain = useQuery(commitQuery(project.name), queryClient);
  const onChainSha = onChain.data ?? null;
  const repositoryUrl = config.officials.githubLink || project.config.url;

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

  useEffect(() => {
    if (onChain.isPending) return;
    let active = true;
    (async () => {
      setLoadError(null);
      setIsLoading(true);
      if (repositoryUrl && onChainSha) {
        try {
          const latestCommit = await getLatestCommitData(
            repositoryUrl,
            onChainSha,
          );
          if (!active) return;
          setCommitData(latestCommit ?? null);
          setLatestCommitStatus(
            !latestCommit
              ? Status.NotFound
              : latestCommit.sha === onChainSha
                ? Status.Match
                : Status.NotMatch,
          );
        } catch {
          if (!active) return;
          setLatestCommitStatus(Status.NotFound);
          setLoadError("Could not load commit data.");
        }
      } else {
        setLatestCommitStatus(Status.NotFound);
      }
      if (active) setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [onChain.isPending, onChainSha, repositoryUrl]);

  if (isOrganization) {
    return <div className="flex flex-col gap-3">{tomlLink}</div>;
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
          {onChainSha && (
            <AttestationCard
              projectName={project.name}
              commitHash={onChainSha}
              connectedPublicKey={publicKey}
              isMaintainer={isMaintainer}
              variant="compact"
            />
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
