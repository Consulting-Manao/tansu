import { useQuery } from "@tanstack/react-query";
import { navigate } from "astro:transitions/client";
import { projectQuery, useProjectConfig } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import Button from "components/utils/Button";
import Loading from "components/utils/Loading";
import Modal from "../../utils/Modal";
import {
  convertGitHubLink,
  getRepositoryIconInfo,
} from "../../../utils/editLinkFunctions";
import { governanceUrl, projectUrl } from "utils/urls";

/** A project at a glance, with the way to its page and its proposals. */
const ProjectInfoModal = ({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) => {
  const project = useQuery(projectQuery(name), queryClient);
  const { config } = useProjectConfig(project.data);

  return (
    <Modal onClose={onClose}>
      {project.isPending ? (
        <Loading />
      ) : !config ? (
        <p className="text-lg">
          {project.error?.message ?? `There is no such project: ${name}`}
        </p>
      ) : (
        <div className="flex max-lg:flex-col gap-12">
          <img
            alt="Project Thumbnail"
            src={
              convertGitHubLink(config.logoImageLink) || "/fallback-image.jpg"
            }
            className="w-[220px] h-[220px] object-contain"
          />
          <div className="flex-grow flex flex-col gap-[30px]">
            <div className="flex flex-col gap-3">
              <p className="leading-4 text-base font-medium text-primary">
                {config.organizationName || "No organization name"}
              </p>
              <h2 className="leading-6 text-2xl font-medium text-primary">
                {config.projectFullName || name}
              </h2>
              <p className="text-sm text-secondary">
                <span className="font-medium">{name}</span>
              </p>
              <p className="leading-4 text-base text-secondary">
                {config.description || "No description"}
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-[30px]">
              <div className="flex flex-col gap-3">
                <h3 className="leading-4 text-base text-secondary">
                  Official Links
                </h3>
                <div className="flex flex-wrap gap-2">
                  {config.officials.websiteLink && (
                    <a
                      href={config.officials.websiteLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src="/icons/logos/web.svg"
                        width={24}
                        height={24}
                        alt="Website"
                        className="icon-websiteLink"
                      />
                    </a>
                  )}
                  {config.officials.githubLink && (
                    <a
                      href={config.officials.githubLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={
                          getRepositoryIconInfo(config.officials.githubLink).src
                        }
                        width={24}
                        height={24}
                        alt={
                          getRepositoryIconInfo(config.officials.githubLink)
                            .label
                        }
                        className="icon-githubLink"
                      />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex max-lg:flex-col gap-[18px]">
              <Button
                icon="/icons/search-white.svg"
                size="xl"
                onClick={() => navigate(projectUrl(name))}
                className="whitespace-nowrap"
              >
                View Details
              </Button>
              <Button
                type="secondary"
                icon="/icons/gear.svg"
                size="xl"
                onClick={() => navigate(governanceUrl(name))}
              >
                Proposals
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ProjectInfoModal;
