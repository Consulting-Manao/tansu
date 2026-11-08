import { useStore } from "@nanostores/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loading, Notice, SectionTitle } from "components/ui";
import { commitHistoryQuery } from "../../../service/RepositoryMetadataService.ts";
import { commitQuery } from "../../../service/ProjectService";
import { queryClient } from "../../../service/queryClient";
import { formatDate } from "../../../utils/formatTimeFunctions.ts";
import { connectedPublicKey } from "../../../utils/store.ts";
import CommitPeriod from "./CommitPeriod";
import CommitRecord from "../../CommitRecord";
import AttestationCard from "./AttestationCard.tsx";
import type { ComponentProps, ReactNode } from "react";
import type { Project } from "../../../../packages/tansu";
import type { ConfigData } from "types/projectConfig";

/**
 * A commit's attestations. Those of the commit on chain show at once; the
 * others are read when asked for: each costs RPC calls, and a page lists 30.
 */
const Attestation = ({
  onChain,
  ...card
}: { onChain: boolean } & ComponentProps<typeof AttestationCard>) => {
  const [shown, setShown] = useState(onChain);
  return shown ? (
    <AttestationCard {...card} />
  ) : (
    <button
      type="button"
      className="text-xs font-semibold text-link underline-offset-2 hover:underline"
      onClick={() => setShown(true)}
    >
      Attestations
    </button>
  );
};

/** The repository's commits, newest first, a page at a time. */
const CommitHistory = ({
  project,
  config,
  action,
}: {
  project: Project;
  config: ConfigData;
  /** Beside the title: the project's evidence. */
  action?: ReactNode;
}) => {
  const publicKey = useStore(connectedPublicKey);
  const isMaintainer = !!publicKey && project.maintainers.includes(publicKey);
  const { data: onChainSha } = useQuery(commitQuery(project.name), queryClient);
  const authors = Object.values(config.handles).map((name) =>
    name.toLowerCase(),
  );
  const repositoryUrl = config.officials.githubLink || project.config.url;

  const [currentPage, setCurrentPage] = useState(1);
  const historyRead = useQuery(
    {
      ...commitHistoryQuery(repositoryUrl, currentPage),
      enabled: !!repositoryUrl,
      placeholderData: keepPreviousData,
    },
    queryClient,
  );
  const commitHistory = historyRead.data ?? [];
  const loadError = !repositoryUrl
    ? "Project repository URL not available."
    : historyRead.isError
      ? "Could not load commit history."
      : null;

  return (
    <section className="flex flex-col gap-6">
      <SectionTitle action={action}>Commit History</SectionTitle>
      {historyRead.isLoading && <Loading />}
      {loadError && <Notice tone="danger">{loadError}</Notice>}
      <ol className="flex flex-col gap-6">
        {commitHistory.map((day) => (
          <li key={day.date} className="flex flex-col gap-3">
            <h3 className="text-small font-semibold text-ink-muted">
              {formatDate(day.date)}
            </h3>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
              {day.commits.map((commit) => (
                <li key={commit.sha}>
                  <CommitRecord
                    bgClass="bg-transparent"
                    message={commit.message}
                    authorName={commit.author.name}
                    authorLink={commit.author.html_url}
                    sha={commit.sha}
                    commitLink={commit.html_url}
                    isMaintainer={authors.includes(
                      commit.author.name.toLowerCase(),
                    )}
                    isLatest={commit.sha === onChainSha}
                    attestation={
                      <Attestation
                        onChain={commit.sha === onChainSha}
                        projectName={project.name}
                        commitHash={commit.sha}
                        connectedPublicKey={publicKey}
                        isMaintainer={isMaintainer}
                        variant="compact"
                      />
                    }
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {(commitHistory.length > 0 || currentPage > 1) && (
        <CommitPeriod
          startDate={commitHistory[0]?.date}
          endDate={commitHistory[commitHistory.length - 1]?.date}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      )}
    </section>
  );
};

export default CommitHistory;
