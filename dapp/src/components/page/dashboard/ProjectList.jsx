import { useStore } from "@nanostores/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { getFeaturedProjectsConfigData } from "../../../constants/featuredProjectsConfigData.js";
import {
  getProjectFromName,
  getMember,
  getProjectsPage,
} from "../../../service/ReadContractService";
import { convertGitHubLink } from "../../../utils/editLinkFunctions";
import {
  configData as configDataStore,
  connectedPublicKey,
  projectCardModalOpen,
  walletInitialized,
} from "../../../utils/store.ts";
import { toast } from "../../../utils/utils";
import CreateProjectModal from "./CreateProjectModal.tsx";
import OnChainProjectCard from "./OnChainProjectCard";
import ProjectCard from "./ProjectCard";
import ProjectInfoModal from "./ProjectInfoModal.jsx";
import MemberProfileModal from "./MemberProfileModal.tsx";
import Spinner from "components/utils/Spinner.tsx";

const ProjectList = () => {
  const isProjectInfoModalOpen = useStore(projectCardModalOpen);
  const configDataFromStore = useStore(configDataStore);
  const isWalletReady = useStore(walletInitialized);

  const [projects, setProjects] = useState(undefined);
  const [filteredProjects, setFilteredProjects] = useState(undefined);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInOnChain, setIsInOnChain] = useState(false);
  const [searchedProject, setSearchedProject] = useState();
  const [_prevPath, setPrevPath] = useState("");
  const [memberNotFound, setMemberNotFound] = useState(false);

  const [showProjectInfoModal, setShowProjectInfoModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [memberResult, setMemberResult] = useState(undefined);
  const [showMemberProfileModal, setShowMemberProfileModal] = useState(false);

  const [onChainProjects, setOnChainProjects] = useState([]);
  const [isLoadingOnChain, setIsLoadingOnChain] = useState(false);
  const [currentUIPage, setCurrentUIPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);

  const searchTimeoutRef = useRef(null);
  const modalSyncSkipRef = useRef(true);
  // Only the latest page or search request may update the list.
  const pageRequestRef = useRef(0);
  const searchRequestRef = useRef(0);

  // Modal handlers
  const handleCreateProjectModal = useCallback(() => {
    setShowCreateProjectModal(true);
  }, []);

  const closeCreateProjectModal = useCallback(() => {
    setShowCreateProjectModal(false);
  }, []);

  // Initial fetch + URL search handling
  useEffect(() => {
    projectCardModalOpen.set(false);

    const fetchProjects = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const data = getFeaturedProjectsConfigData();
      setProjects(data);
      setFilteredProjects(data);
    };

    fetchProjects();

    const referrer = document.referrer;
    if (referrer && !referrer.includes(window.location.host))
      setPrevPath(referrer);

    const searchParams = new URLSearchParams(window.location.search);
    const urlSearchTerm = searchParams.get("search");
    if (urlSearchTerm) {
      setSearchTerm(urlSearchTerm);
      setTimeout(() => handleSearch(), 300);
    }

    const isMemberSearch = searchParams.get("member") === "true";
    if (isMemberSearch && urlSearchTerm) handleMemberSearch(urlSearchTerm);

    const pendingMemberProfile = sessionStorage.getItem("pendingMemberProfile");
    if (pendingMemberProfile) {
      try {
        const memberData = JSON.parse(pendingMemberProfile);
        setMemberResult(memberData);
        setShowMemberProfileModal(true);
        sessionStorage.removeItem("pendingMemberProfile");
      } catch {}
    }

    const openCreateProjectModal = sessionStorage.getItem(
      "openCreateProjectModal",
    );
    if (openCreateProjectModal === "true") {
      sessionStorage.removeItem("openCreateProjectModal");

      const tryOpenModal = () => {
        if (connectedPublicKey.get()) {
          setShowCreateProjectModal(true);
        } else {
          toast.error(
            "Connect Wallet",
            "Please connect your wallet first to add a project",
          );
        }
      };

      if (walletInitialized.get()) {
        tryOpenModal();
      } else {
        const unsub = walletInitialized.subscribe((initialized) => {
          if (!initialized) return;
          unsub();
          tryOpenModal();
        });
      }
    }

    window.addEventListener("search-projects", handleSearchProjectEvent);
    window.addEventListener("show-member-profile", handleMemberProfileEvent);
    window.addEventListener("search-member", handleSearchMemberEvent);
    document.addEventListener(
      "show-create-project-modal",
      handleCreateProjectModal,
    );
    document.addEventListener(
      "create-project-global",
      handleCreateProjectModal,
    );

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      window.removeEventListener("search-projects", handleSearchProjectEvent);
      window.removeEventListener(
        "show-member-profile",
        handleMemberProfileEvent,
      );
      window.removeEventListener("search-member", handleSearchMemberEvent);
      document.removeEventListener(
        "show-create-project-modal",
        handleCreateProjectModal,
      );
      document.removeEventListener(
        "create-project-global",
        handleCreateProjectModal,
      );
    };
  }, [handleCreateProjectModal]);

  useEffect(() => {
    if (modalSyncSkipRef.current) {
      modalSyncSkipRef.current = false;
      return;
    }
    setShowProjectInfoModal(isProjectInfoModalOpen);
  }, [isProjectInfoModalOpen]);

  useEffect(() => {
    if (projects && searchTerm) handleSearch();
  }, [projects, searchTerm]);

  const handleSearchProjectEvent = useCallback((event) => {
    const term = event.detail;
    setSearchTerm(term);
    setMemberNotFound(false);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearch(), 100);
  }, []);

  const handleSearchMemberEvent = (event) => {
    const address = event.detail;
    setSearchTerm(address);
    handleMemberSearch(address);
  };

  const handleMemberProfileEvent = (event) => {
    const member = event.detail;
    setMemberResult(member);
    setShowMemberProfileModal(true);
  };

  const handleSearch = () => {
    if (!projects) return;
    setMemberNotFound(false);

    const filtered = projects.filter(
      (project) =>
        project &&
        project.projectName &&
        project.projectName.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    setFilteredProjects(filtered);

    if (searchTerm && filtered.length === 0) checkProjectOnChain(searchTerm);
  };

  const checkProjectOnChain = async (projectName) => {
    const request = ++searchRequestRef.current;
    setIsLoading(true);
    try {
      const project = await getProjectFromName(projectName);
      if (request !== searchRequestRef.current) return;
      if (project && project.name && project.config && project.maintainers) {
        setSearchedProject(project);
        setIsInOnChain(true);
      } else {
        setIsInOnChain(false);
      }
    } catch {
      if (request === searchRequestRef.current) setIsInOnChain(false);
    } finally {
      if (request === searchRequestRef.current) setIsLoading(false);
    }
  };

  const _handleClearSearch = () => {
    setSearchTerm("");
    setMemberNotFound(false);
    window.location.href = "/";
  };

  const handleMemberSearch = async (address) => {
    if (!address) return;

    setIsLoading(true);
    setMemberNotFound(false);

    try {
      const member = await getMember(address);
      if (member) {
        setMemberResult(member);
        setShowMemberProfileModal(true);
      } else setMemberNotFound(true);
    } catch {
      setMemberNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Cards render as soon as the contract answers; each fills in its own
  // tansu.toml, so a dead or slow CID never holds the list back.
  const fetchProjectsForPage = async (uiPage) => {
    const request = ++pageRequestRef.current;
    setIsLoadingOnChain(true);
    try {
      const projectsPage = await getProjectsPage(uiPage - 1);
      if (request !== pageRequestRef.current) return;
      setOnChainProjects(projectsPage);
      setHasNextPage(projectsPage.length > 0);
    } catch {
      if (request !== pageRequestRef.current) return;
      setOnChainProjects([]);
      setHasNextPage(false);
    } finally {
      if (request === pageRequestRef.current) setIsLoadingOnChain(false);
    }
  };

  useEffect(() => {
    fetchProjectsForPage(1);
  }, []);

  const handleNextPage = async () => {
    if (!hasNextPage) return;

    const nextPage = currentUIPage + 1;
    setCurrentUIPage(nextPage);
    await fetchProjectsForPage(nextPage);

    document.querySelector(".all-projects-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handlePrevPage = async () => {
    if (currentUIPage <= 1) return;

    const prevPage = currentUIPage - 1;
    setCurrentUIPage(prevPage);
    await fetchProjectsForPage(prevPage);

    document.querySelector(".all-projects-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const showFeaturedHeading =
    !searchTerm ||
    (filteredProjects && filteredProjects.length > 0 && !isInOnChain);

  const paginationControls = (
    <div className="flex justify-center items-center gap-4 py-4">
      <button
        onClick={handlePrevPage}
        disabled={currentUIPage <= 1 || isLoadingOnChain}
        className="disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <img src="/icons/arrow-left.svg" alt="Previous page" />
      </button>
      <span className="text-base text-primary font-medium">
        {currentUIPage}
      </span>
      <button
        onClick={handleNextPage}
        disabled={!hasNextPage || isLoadingOnChain}
        className="disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <img src="/icons/arrow-right.svg" alt="Next page" />
      </button>
    </div>
  );

  const projectInfo = configDataFromStore
    ? {
        ...configDataFromStore,
        logoImageLink: configDataFromStore.logoImageLink
          ? convertGitHubLink(configDataFromStore.logoImageLink)
          : configDataFromStore.logoImageLink,
      }
    : null;

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
          <Spinner />
        </div>
      ) : memberNotFound ? (
        <div className="flex flex-col items-center justify-center py-12">
          <img className="mx-auto mb-8" src="/images/no-result.svg" />
          <p className="text-xl text-center font-medium text-zinc-700">
            Member not found. Try searching for something else.
          </p>
        </div>
      ) : filteredProjects && filteredProjects.length > 0 ? (
        <div className="project-list grid gap-6 md:gap-8 grid-cols-1 sm:grid-cols-2 justify-items-center items-stretch">
          {filteredProjects.map((project, index) => (
            <div className="w-full h-full" key={index}>
              <ProjectCard config={project} />
            </div>
          ))}
        </div>
      ) : isInOnChain ? (
        <div className="w-full sm:w-1/2 mx-auto pb-[120px]">
          <OnChainProjectCard
            key={`${searchedProject.name}:${searchedProject.config.ipfs}`}
            project={searchedProject}
          />
        </div>
      ) : searchTerm ? (
        <div className="flex flex-col items-center justify-center py-12">
          <img className="mx-auto mb-8" src="/images/no-result.svg" />
          <p className="text-xl text-center font-medium text-zinc-700">
            Project not found. Try searching for something else.
          </p>
        </div>
      ) : (
        <div className="h-80 flex flex-col gap-6 justify-center items-center text-center py-4">
          <p className="px-3 py-1 text-base sm:text-lg font-medium">
            No projects found. Try searching for something.
          </p>
        </div>
      )}

      {!searchTerm && !memberNotFound && !isInOnChain && (
        <div className="mt-16 all-projects-section">
          <div className="flex flex-col items-center gap-[30px] md:gap-[60px] mb-8">
            <div className="w-full flex justify-center items-center">
              <p className="text-[26px] leading-[42px] font-firamono text-pink">
                All Projects
              </p>
            </div>
          </div>

          {isLoadingOnChain ? (
            <div className="no-projects h-80 flex flex-col gap-6 justify-center items-center text-center py-4">
              <Spinner />
              <p className="text-base text-secondary">Loading projects ...</p>
            </div>
          ) : onChainProjects.length > 0 ? (
            <div className="flex flex-col gap-8">
              <div className="project-list grid gap-6 md:gap-8 grid-cols-1 sm:grid-cols-2 justify-items-center items-stretch">
                {onChainProjects.map((project) => (
                  <div
                    className="w-full h-full"
                    key={`${project.name}:${project.config.ipfs}`}
                  >
                    <OnChainProjectCard project={project} />
                  </div>
                ))}
              </div>
              {paginationControls}
            </div>
          ) : currentUIPage > 1 ? (
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

      {showProjectInfoModal && (
        <ProjectInfoModal
          id="project-info-modal"
          projectInfo={projectInfo}
          onClose={() => projectCardModalOpen.set(false)}
        />
      )}

      {showCreateProjectModal && (isWalletReady || window.__TEST_MODE__) && (
        <div className="project-modal-container">
          <CreateProjectModal onClose={closeCreateProjectModal} />
        </div>
      )}

      {showMemberProfileModal && memberResult && (
        <MemberProfileModal
          member={memberResult}
          address={searchTerm}
          onClose={() => setShowMemberProfileModal(false)}
        />
      )}
    </div>
  );
};

export default ProjectList;
