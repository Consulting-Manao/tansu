import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { repoCommitQuery } from "@service/RepositoryMetadataService";
import { commitQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { CopyButton, ProofChip, Skeleton } from "components/ui";
import type { Project } from "../../../../packages/tansu";
import type { ConfigData } from "types/projectConfig";
import { formatDate } from "utils/formatTimeFunctions";
import { connectedPublicKey } from "utils/store";
import AttestationCard from "./AttestationCard";

/** The commit a maintainer set on chain, checked against the repository. */
const LatestCommit = ({
  project,
  config,
}: {
  project: Project;
  config: ConfigData;
}) => {
  const publicKey = useStore(connectedPublicKey);
  const isMaintainer = !!publicKey && project.maintainers.includes(publicKey);
  const onChain = useQuery(commitQuery(project.name), queryClient);
  const onChainSha = onChain.data ?? null;
  const repositoryUrl = config.officials.githubLink || project.config.url;

  const commitRead = useQuery(
    {
      ...repoCommitQuery(repositoryUrl, onChainSha ?? ""),
      enabled: !!repositoryUrl && !!onChainSha,
    },
    queryClient,
  );
  const commit = commitRead.data ?? null;
  const inHistory = !!commit && commit.sha === onChainSha;

  if (onChain.isPending || commitRead.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="w-1/3" />
      </div>
    );
  }
  if (!onChainSha) {
    return <p className="text-ink-muted">No commit recorded on chain yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {commit && (
        <>
          <p className="text-card font-semibold break-words">
            {commit.commit.message.split("\n")[0]}
          </p>
          <p className="text-small text-ink-muted">
            @{commit.commit.author.name} ·{" "}
            {formatDate(commit.commit.committer.date)}
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {commitRead.isError ? (
          <ProofChip hash={onChainSha} tone="pending">
            Could not read the repository
          </ProofChip>
        ) : (
          <ProofChip hash={onChainSha} tone={inHistory ? "verified" : "failed"}>
            {inHistory ? "In git history" : "Not in git history"}
          </ProofChip>
        )}
        <CopyButton textToCopy={commit?.html_url || onChainSha} size="sm" />
        {commit?.html_url && (
          <a
            href={commit.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-small font-semibold text-link underline-offset-2 hover:underline"
          >
            View commit
          </a>
        )}
        <AttestationCard
          projectName={project.name}
          commitHash={onChainSha}
          connectedPublicKey={publicKey}
          isMaintainer={isMaintainer}
          variant="compact"
        />
      </div>
    </div>
  );
};

export default LatestCommit;
