import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { FC } from "react";
import Modal from "components/utils/Modal";
import { repoReadmeQuery } from "../../../service/RepositoryMetadataService";
import { queryClient } from "../../../service/queryClient";
import Markdown from "components/utils/Markdown";

import CopyButton from "components/utils/CopyButton";
import {
  getRepositoryCloneCommand,
  getRepositoryIconInfo,
  getRepositoryReleasesUrl,
} from "../../../utils/editLinkFunctions";

interface ReadMoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectData?: {
    name: string;
    description: string;
    organization: string;
    logoImageLink: string;
    githubUrl: string;
    websiteUrl?: string;
  };
}

const ReadMoreModal: FC<ReadMoreModalProps> = ({
  isOpen,
  onClose,
  projectData,
}) => {
  const repositoryIcon = getRepositoryIconInfo(projectData?.githubUrl);
  const releasesUrl = getRepositoryReleasesUrl(projectData?.githubUrl);
  const readme = useQuery(
    {
      ...repoReadmeQuery(projectData?.githubUrl ?? ""),
      enabled: isOpen && !!projectData?.githubUrl,
    },
    queryClient,
  );
  const readmeContent = readme.isError
    ? "Failed to load README content. Please check the repository directly."
    : readme.data
      ? readme.data.content
      : readme.isSuccess || !projectData?.githubUrl
        ? "No README available for this project."
        : "";

  const handleGoToReleases = useCallback(() => {
    if (releasesUrl) {
      window.open(releasesUrl, "_blank");
    }
  }, [releasesUrl]);

  if (!isOpen) return null;

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center sm:items-start gap-4 sm:gap-6">
        <img
          className="w-[90px] h-[90px] sm:w-[110px] sm:h-[110px] lg:w-[150px] lg:h-[150px] object-contain"
          alt="Project thumbnail"
          src={projectData?.logoImageLink || "/fallback-image.jpg"}
        />
        <div className="flex flex-col gap-3 sm:gap-4 w-full">
          <div className="flex flex-col gap-2 sm:gap-3">
            <p className="leading-4 text-sm sm:text-base text-secondary text-center sm:text-left">
              {projectData?.organization || ""}
            </p>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-[18px]">
              <p className="text-xl sm:text-2xl text-primary text-center sm:text-left">
                {projectData?.name || ""}
              </p>
              <div className="flex items-center gap-3">
                {projectData?.githubUrl && (
                  <a
                    href={projectData.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={repositoryIcon.src}
                      alt={repositoryIcon.label}
                      className="w-4 h-4"
                    />
                  </a>
                )}
                {projectData?.websiteUrl && (
                  <a
                    href={projectData.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src="/icons/logos/web.svg"
                      alt="Website"
                      className="w-4 h-4"
                    />
                  </a>
                )}
              </div>
            </div>
            <p className="text-sm sm:text-base text-primary text-center sm:text-left max-w-full break-words">
              {projectData?.description || ""}
            </p>
          </div>

          <div className="relative flex flex-col items-center w-full">
            <div className="flex flex-col gap-4 sm:gap-6 w-full">
              <div className="flex max-sm:flex-col gap-2 sm:gap-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <CopyButton
                    textToCopy={
                      getRepositoryCloneCommand(projectData?.githubUrl) || ""
                    }
                    showText={true}
                    text="Clone Repository"
                    className="w-full sm:w-auto p-2 sm:p-[9px_30px] lg:p-[18px_30px] bg-[#F5F1F9]"
                  />
                </div>
                {releasesUrl ? (
                  <button
                    onClick={handleGoToReleases}
                    className="p-2 sm:p-[9px_30px] lg:p-[18px_30px] bg-[#F5F1F9] flex items-center justify-center sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto"
                  >
                    <img
                      src="/icons/link.svg"
                      className="w-4 h-4 sm:w-auto sm:h-auto"
                      alt="External link"
                    />
                    <span className="leading-5 text-base sm:text-xl text-primary cursor-pointer">
                      Go to Releases
                    </span>
                  </button>
                ) : null}
              </div>
              <Markdown
                className="border border-gray-200 rounded h-auto max-h-[60vh] overflow-y-auto overflow-x-hidden p-4"
                baseUrl={readme.data?.rawBaseUrl}
              >
                {readmeContent || projectData?.description || ""}
              </Markdown>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ReadMoreModal;
