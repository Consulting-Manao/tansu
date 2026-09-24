import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import Markdown from "markdown-to-jsx";
import { useEffect, useMemo, useState } from "react";
import { getCommitHistory } from "../../../service/RepositoryMetadataService.ts";
import { commitQuery } from "../../../service/ProjectService";
import { queryClient } from "../../../service/queryClient";
import { isValidCid } from "../../../utils/contentHashes";
import { formatDate } from "../../../utils/formatTimeFunctions.ts";
import { getIpfsUrl, ipfsQuery } from "../../../utils/ipfsFunctions";
import { connectedPublicKey } from "../../../utils/store.ts";
import CommitPeriod from "./CommitPeriod.jsx";
import CommitRecord from "../../CommitRecord";
import AttestationCard from "./AttestationCard.tsx";

/** The repository's commits, or the README of a project without code. */
const CommitHistory = ({ project, config, isSoftware }) => {
  const publicKey = useStore(connectedPublicKey);
  const isMaintainer = !!publicKey && project.maintainers.includes(publicKey);
  const { data: onChainSha } = useQuery(commitQuery(project.name), queryClient);
  const readmeRead = useQuery(
    {
      ...ipfsQuery(project.config.ipfs, "/README.md"),
      enabled: !isSoftware && isValidCid(project.config.ipfs),
    },
    queryClient,
  );
  // Relative images point into the project's IPFS directory.
  const readme = useMemo(
    () =>
      readmeRead.data?.replace(
        /!\[([^\]]*)\]\((?!https?:\/\/)\.?\/?([^)]+)\)/g,
        (_, alt, src) => `![${alt}](${getIpfsUrl(project.config.ipfs)}/${src})`,
      ),
    [readmeRead.data, project.config.ipfs],
  );
  const authors = config.authorGithubNames
    .filter((name) => typeof name === "string")
    .map((name) => name.toLowerCase());
  const repositoryUrl = config.officials.githubLink || project.config.url;

  const [commitHistory, setCommitHistory] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!isSoftware) return;
    if (!repositoryUrl) {
      setLoadError("Project repository URL not available.");
      setIsLoading(false);
      return;
    }
    let active = true;
    setLoadError(null);
    setIsLoading(true);
    getCommitHistory(repositoryUrl, currentPage)
      .then((history) => active && setCommitHistory(history ?? []))
      .catch(() => {
        if (!active) return;
        setLoadError("Could not load commit history.");
        setCommitHistory([]);
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [isSoftware, repositoryUrl, currentPage]);

  return (
    <>
      <div className="px-[16px] lg:px-[72px] flex flex-col gap-12">
        <div className="flex flex-col gap-[18px]">
          <p className="leading-6 text-2xl font-medium text-primary">
            {isSoftware ? "Commit History" : "README"}
          </p>
          <div className="border-t border-[#EEEEEE]" />
        </div>

        {!isSoftware ? (
          readme ? (
            <div className="markdown-body border border-gray-200 rounded max-h-[60vh] overflow-y-auto overflow-x-hidden p-4">
              <Markdown
                options={{
                  overrides: {
                    img: { props: { className: "max-w-full h-auto" } },
                  },
                }}
              >
                {readme}
              </Markdown>
            </div>
          ) : (
            <p className="text-base text-secondary">No README available.</p>
          )
        ) : (
          <>
            {isLoading && (
              <p className="text-base text-tertiary" aria-busy="true">
                Loading commit history…
              </p>
            )}
            {loadError && (
              <p className="text-sm text-red-600" role="alert">
                {loadError}
              </p>
            )}
            <div className="commit-history-container pl-[44px] lg:pl-[54px] max-h-[560px] flex flex-col gap-6 overflow-auto">
              {commitHistory.map((day) => (
                <div key={day.date} className="day-group flex flex-col gap-6">
                  <h3 className="relative">
                    <div className="absolute -left-[40px] lg:-left-[50px] top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-[#2D0F512E] rounded-full"></div>
                    <span className="leading-6 text-lg text-primary">
                      {formatDate(day.date)}
                    </span>
                  </h3>
                  <div className="space-y-4">
                    {day.commits.map((commit) => (
                      <div key={commit.sha} className="relative">
                        <div className="absolute -left-[31px] lg:-left-[41px] w-[2px] h-full bg-[#2D0F510D]" />
                        <CommitRecord
                          message={commit.message}
                          date={commit.commit_date}
                          authorName={commit.author.name}
                          authorGithubLink={commit.author.html_url}
                          sha={commit.sha}
                          commitLink={commit.html_url}
                          isMaintainer={authors.includes(
                            commit.author.name.toLowerCase(),
                          )}
                          isLatest={commit.sha === onChainSha}
                          attestation={
                            <AttestationCard
                              projectName={project.name}
                              commitHash={commit.sha}
                              connectedPublicKey={publicKey}
                              isMaintainer={isMaintainer}
                              variant="compact"
                            />
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <CommitPeriod
              startDate={commitHistory[0]?.date}
              endDate={commitHistory[commitHistory.length - 1]?.date}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </>
  );
};

export default CommitHistory;
