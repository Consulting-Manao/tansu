import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FEATURED_PROJECTS } from "../../../constants/featuredProjects";
import { memberQuery } from "../../../service/MemberService";
import { projectQuery, projectsQuery } from "../../../service/ProjectService";
import { queryClient } from "../../../service/queryClient";
import { openModal } from "../../../utils/modals";
import Button from "components/utils/Button";
import {
  ErrorBoundary,
  withErrorBoundary,
} from "components/utils/ErrorBoundary";
import OnChainProjectCard from "./OnChainProjectCard";
import ProjectCard from "./ProjectCard";
import Loading from "components/utils/Loading";

const scrollToAllProjects = () =>
  document.querySelector(".all-projects-section")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

const ProjectList = () => {
  const [searchTerm, setSearchTerm] = useState("");
  // Set when the search is for a member: their address.
  const [memberAddress, setMemberAddress] = useState("");
  const [page, setPage] = useState(0);

  // Featured projects matching the search; when none match, the project of
  // that name on chain.
  const filteredProjects = FEATURED_PROJECTS.filter((project) =>
    project.projectName.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const searched = useQuery(
    {
      ...projectQuery(searchTerm),
      enabled: !!searchTerm && !memberAddress && !filteredProjects.length,
    },
    queryClient,
  );
  const member = useQuery(
    { ...memberQuery(memberAddress), enabled: !!memberAddress },
    queryClient,
  );
  // Cards render as soon as the contract answers; each fills in its own
  // tansu.toml, so a dead or slow CID never holds the list back.
  const onChain = useQuery(
    { ...projectsQuery(page), placeholderData: keepPreviousData },
    queryClient,
  );
  const onChainProjects = onChain.data ?? [];
  const hasNextPage = onChainProjects.length > 0;

  const isLoading = searched.isLoading || member.isLoading;
  const memberNotFound =
    !!memberAddress && (member.isError || member.data === null);
  const isInOnChain = !!searched.data;

  // The search is in the address (`/?search=`, `&member=true` for a member).
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const term = searchParams.get("search");
    if (!term) return;
    setSearchTerm(term);
    if (searchParams.get("member") === "true") setMemberAddress(term);
  }, []);

  useEffect(() => {
    if (member.data) openModal("profile", { address: memberAddress });
  }, [member.data, memberAddress]);

  const showPage = (next: number) => {
    setPage(next);
    scrollToAllProjects();
  };

  const showFeaturedHeading =
    !searchTerm || (filteredProjects.length > 0 && !isInOnChain);

  const paginationControls = (
    <div className="flex justify-center items-center gap-4 py-4">
      <button
        onClick={() => showPage(page - 1)}
        disabled={page === 0 || onChain.isFetching}
        className="disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <img src="/icons/arrow-left.svg" alt="Previous page" />
      </button>
      <span className="text-base text-primary font-medium">{page + 1}</span>
      <button
        onClick={() => showPage(page + 1)}
        disabled={!hasNextPage || onChain.isFetching}
        className="disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <img src="/icons/arrow-right.svg" alt="Next page" />
      </button>
    </div>
  );

  return (
    <div className="project-list-container relative mx-auto w-full max-w-[984px] px-4">
      {showFeaturedHeading && (
        <div className="flex flex-col items-center gap-[30px] md:gap-[60px] mb-8">
          <div className="w-full flex justify-center items-center">
            <p className="text-[26px] leading-[42px] font-firamono text-pink">
              Featured Projects
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="no-projects h-80 flex flex-col gap-6 justify-center items-center text-center py-4">
          <Loading />
        </div>
      ) : memberNotFound ? (
        <div className="flex flex-col items-center justify-center py-12">
          <img alt="" className="mx-auto mb-8" src="/images/no-result.svg" />
          <p className="text-xl text-center font-medium text-zinc-700">
            Member not found. Try searching for something else.
          </p>
        </div>
      ) : memberAddress ? null : filteredProjects.length > 0 ? (
        <div className="project-list grid gap-6 md:gap-8 grid-cols-1 sm:grid-cols-2 justify-items-center items-stretch">
          {filteredProjects.map((project) => (
            <div className="w-full h-full" key={project.projectName}>
              <ProjectCard config={project} />
            </div>
          ))}
        </div>
      ) : searched.data ? (
        <div className="w-full sm:w-1/2 mx-auto pb-[120px]">
          <OnChainProjectCard
            key={`${searched.data.name}:${searched.data.config.ipfs}`}
            project={searched.data}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12">
          <img alt="" className="mx-auto mb-8" src="/images/no-result.svg" />
          <p className="text-xl text-center font-medium text-zinc-700">
            {searched.isError
              ? `Could not search: ${searched.error.message}`
              : "Project not found. Try searching for something else."}
          </p>
        </div>
      )}

      {!searchTerm && (
        <div className="mt-16 all-projects-section">
          <div className="flex flex-col items-center gap-[30px] md:gap-[60px] mb-8">
            <div className="w-full flex justify-center items-center">
              <p className="text-[26px] leading-[42px] font-firamono text-pink">
                All Projects
              </p>
            </div>
          </div>

          {onChain.isPending ? (
            <div className="no-projects h-80 flex flex-col gap-6 justify-center items-center text-center py-4">
              <Loading />
              <p className="text-base text-secondary">Loading projects ...</p>
            </div>
          ) : onChain.isError ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <p className="text-xl text-center font-medium text-zinc-700">
                Could not load the projects: {onChain.error.message}
              </p>
              <Button type="secondary" onClick={() => onChain.refetch()}>
                Retry
              </Button>
            </div>
          ) : onChainProjects.length > 0 ? (
            <div className="flex flex-col gap-8">
              <div className="project-list grid gap-6 md:gap-8 grid-cols-1 sm:grid-cols-2 justify-items-center items-stretch">
                {onChainProjects.map((project) => (
                  <div
                    className="w-full h-full"
                    key={`${project.name}:${project.config.ipfs}`}
                  >
                    {/* Anyone writes a project's files: one cannot take the
                        list down. */}
                    <ErrorBoundary>
                      <OnChainProjectCard project={project} />
                    </ErrorBoundary>
                  </div>
                ))}
              </div>
              {paginationControls}
            </div>
          ) : page > 0 ? (
            <div className="flex flex-col gap-8">
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-xl text-center font-medium text-zinc-700">
                  No more projects
                </p>
              </div>
              {paginationControls}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-xl text-center font-medium text-zinc-700">
                No projects found yet.
              </p>
              <p className="text-base text-center text-secondary mt-2">
                Be the first to register a project!
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default withErrorBoundary(ProjectList);
