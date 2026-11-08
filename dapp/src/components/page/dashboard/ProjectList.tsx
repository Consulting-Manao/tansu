import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FEATURED_PROJECTS } from "../../../constants/featuredProjects";
import { memberQuery } from "../../../service/MemberService";
import { projectQuery, projectsQuery } from "../../../service/ProjectService";
import { queryClient } from "../../../service/queryClient";
import { openModal } from "../../../utils/modals";
import { Button, EmptyState, Loading, SectionTitle } from "components/ui";
import {
  ErrorBoundary,
  withErrorBoundary,
} from "components/utils/ErrorBoundary";
import OnChainProjectCard from "./OnChainProjectCard";
import ProjectCard from "./ProjectCard";

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
    // An account (G…) or a smart account (C…) is a member, also when the
    // search came from the home page's form, which cannot say so.
    if (
      searchParams.get("member") === "true" ||
      /^[GC][A-Z2-7]{55}$/.test(term)
    )
      setMemberAddress(term);
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
    <nav aria-label="Pages" className="flex items-center justify-center gap-3">
      <Button
        tone="ghost"
        aria-label="Previous page"
        onClick={() => showPage(page - 1)}
        disabled={page === 0 || onChain.isFetching}
      >
        Previous
      </Button>
      <span className="figures-tabular text-ui text-ink-muted">
        Page {page + 1}
      </span>
      <Button
        tone="ghost"
        aria-label="Next page"
        onClick={() => showPage(page + 1)}
        disabled={!hasNextPage || onChain.isFetching}
      >
        Next
      </Button>
    </nav>
  );

  const grid = "project-list grid items-stretch gap-6 sm:grid-cols-2";

  return (
    <div className="project-list-container flex w-full flex-col gap-16">
      <section className="flex flex-col gap-6">
        {showFeaturedHeading && <SectionTitle>Featured projects</SectionTitle>}
        {isLoading ? (
          <Loading />
        ) : memberNotFound ? (
          <EmptyState image="/images/no-result.svg" title="Member not found">
            Try another address or a project name.
          </EmptyState>
        ) : memberAddress ? null : filteredProjects.length > 0 ? (
          <div className={grid}>
            {filteredProjects.map((project) => (
              <ProjectCard key={project.projectName} config={project} />
            ))}
          </div>
        ) : searched.data ? (
          <div className="sm:max-w-[calc(50%-12px)]">
            <OnChainProjectCard
              key={`${searched.data.name}:${searched.data.config.ipfs}`}
              project={searched.data}
            />
          </div>
        ) : (
          <EmptyState
            image="/images/no-result.svg"
            title={searched.isError ? "Could not search" : "Project not found"}
          >
            {searched.isError
              ? searched.error.message
              : "Try another name, or an address for a member."}
          </EmptyState>
        )}
      </section>

      {!searchTerm && (
        <section className="all-projects-section flex scroll-mt-6 flex-col gap-6">
          <SectionTitle>All projects</SectionTitle>
          {onChain.isPending ? (
            <Loading label="Loading projects…" />
          ) : onChain.isError ? (
            <EmptyState
              title="Could not load the projects"
              action={
                <Button tone="secondary" onClick={() => onChain.refetch()}>
                  Retry
                </Button>
              }
            >
              {onChain.error.message}
            </EmptyState>
          ) : onChainProjects.length > 0 ? (
            <>
              <div className={grid}>
                {onChainProjects.map((project) => (
                  // Anyone writes a project's files: one cannot take the
                  // list down.
                  <ErrorBoundary key={`${project.name}:${project.config.ipfs}`}>
                    <OnChainProjectCard project={project} />
                  </ErrorBoundary>
                ))}
              </div>
              {paginationControls}
            </>
          ) : page > 0 ? (
            <>
              <EmptyState title="No more projects" />
              {paginationControls}
            </>
          ) : (
            <EmptyState title="No projects yet">
              Be the first to register one.
            </EmptyState>
          )}
        </section>
      )}
    </div>
  );
};

export default withErrorBoundary(ProjectList);
