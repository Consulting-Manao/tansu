import { useState } from "react";
import {
  convertGitHubLink,
  getRepositoryIconInfo,
} from "../../../utils/editLinkFunctions";
import ProjectInfoModal from "./ProjectInfoModal";

interface ProjectConfig {
  projectName: string;
  projectFullName?: string;
  description?: string;
  logoImageLink?: string | null;
  officials: {
    websiteLink?: string;
    githubLink?: string;
  };
  socialLinks: Record<string, string | undefined>;
  organizationName?: string;
}

const placeholder = "bg-zinc-200 motion-safe:animate-pulse";

const ProjectCard = ({
  config,
  isMetadataLoading = false,
}: {
  config: ProjectConfig;
  /** tansu.toml is still loading: show placeholders for the empty fields. */
  isMetadataLoading?: boolean;
}) => {
  const repositoryIcon = getRepositoryIconInfo(config.officials.githubLink);

  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      className="project-card w-full h-full flex flex-col shadow-card rounded-sm overflow-hidden hover:shadow-lg transition-shadow duration-300"
      aria-busy={isMetadataLoading || undefined}
    >
      <div
        className="h-[200px] sm:h-[240px] md:h-[290px] bg-white/25 backdrop-blur-[9px] overflow-hidden cursor-pointer group flex justify-center items-center flex-shrink-0"
        onClick={() => setShowInfo(true)}
      >
        {!config.logoImageLink && isMetadataLoading ? (
          <div
            aria-hidden="true"
            className={`w-30 h-30 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-lg ${placeholder}`}
          />
        ) : (
          <img
            src={
              config.logoImageLink
                ? convertGitHubLink(config.logoImageLink)
                : "/fallback-image.jpg"
            }
            alt={config.projectName}
            className="thumbnail w-30 h-30 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-lg object-contain transition-transform duration-300 ease-in-out group-hover:scale-110"
          />
        )}
      </div>
      <div className="flex-grow bg-white p-4 sm:p-6 flex flex-col gap-4 sm:gap-[30px] justify-between">
        <div className="flex flex-col gap-2 sm:gap-3">
          <h3 className="project-name text-xl sm:text-2xl leading-6 font-medium font-firamono text-pink">
            {config.projectFullName || config.projectName || "No project name"}
          </h3>
          <p className="text-sm text-secondary">
            <span className="font-medium">{config.projectName}</span>
          </p>
          {!config.description && isMetadataLoading ? (
            <div
              aria-hidden="true"
              className="flex flex-col justify-center gap-2 min-h-[2.5rem] sm:min-h-[3rem]"
            >
              <div className={`h-3.5 w-full rounded ${placeholder}`} />
              <div className={`h-3.5 w-2/3 rounded ${placeholder}`} />
            </div>
          ) : (
            <p className="description text-sm sm:text-base font-victormono text-zinc-800 line-clamp-2 min-h-[2.5rem] sm:min-h-[3rem]">
              {config.description || "No description"}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
          <div className="links flex gap-2 items-center">
            {config.officials.websiteLink && (
              <a
                href={config.officials.websiteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
              >
                <img
                  src="/icons/logos/web.svg"
                  width={24}
                  height={24}
                  className="icon-website"
                />
              </a>
            )}
            {config.officials.githubLink && (
              <a
                href={config.officials.githubLink}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
              >
                <img
                  src={repositoryIcon.src}
                  width={24}
                  height={24}
                  alt={repositoryIcon.label}
                  className="icon-repository"
                />
              </a>
            )}
            {Object.entries(config.socialLinks).map(
              ([platform, link]) =>
                link && (
                  <a
                    key={platform}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-80 transition-opacity"
                  >
                    <img
                      src={`/icons/logos/${platform}.svg`}
                      width={16}
                      height={16}
                      className={`icon-${platform}`}
                    />
                  </a>
                ),
            )}
          </div>
          {config.organizationName ? (
            <p className="organization-name text-sm sm:text-base leading-4 font-firamono text-pink font-light">
              by <span className="font-medium">{config.organizationName}</span>
            </p>
          ) : isMetadataLoading ? (
            <div
              aria-hidden="true"
              className={`h-4 w-32 rounded ${placeholder}`}
            />
          ) : (
            <p className="organization-name text-sm sm:text-base leading-4 font-firamono text-pink">
              No organization name
            </p>
          )}
        </div>
      </div>
      {showInfo && (
        <ProjectInfoModal
          name={config.projectName}
          onClose={() => setShowInfo(false)}
        />
      )}
    </div>
  );
};

export default ProjectCard;
