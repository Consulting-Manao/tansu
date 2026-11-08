import { Skeleton } from "components/ui";
import { focusRing } from "components/ui/style";
import {
  convertGitHubLink,
  getRepositoryIconInfo,
} from "../../../utils/editLinkFunctions";
import { projectUrl } from "utils/urls";

/** What a project card shows. */
export interface CardConfig {
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

/**
 * A project: the card is one link to its page (its title link covers it);
 * the website and repository links sit above that cover.
 */
const ProjectCard = ({
  config,
  isMetadataLoading = false,
}: {
  config: CardConfig;
  /** tansu.toml is still loading: show placeholders for the empty fields. */
  isMetadataLoading?: boolean;
}) => {
  const repositoryIcon = getRepositoryIconInfo(config.officials.githubLink);
  const links = [
    config.officials.websiteLink && {
      href: config.officials.websiteLink,
      src: "/icons/logos/web.svg",
      label: "Website",
    },
    config.officials.githubLink && {
      href: config.officials.githubLink,
      src: repositoryIcon.src,
      label: repositoryIcon.label,
    },
    ...Object.entries(config.socialLinks).map(
      ([platform, href]) =>
        href && { href, src: `/icons/logos/${platform}.svg`, label: platform },
    ),
  ].filter(Boolean) as { href: string; src: string; label: string }[];

  return (
    <article
      className="project-card relative flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-raise transition-shadow hover:shadow-float sm:p-6"
      aria-busy={isMetadataLoading || undefined}
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-card bg-sunken">
        {!config.logoImageLink && isMetadataLoading ? (
          <Skeleton className="size-9 rounded-control" />
        ) : (
          <img
            src={
              config.logoImageLink
                ? convertGitHubLink(config.logoImageLink)
                : "/fallback-image.jpg"
            }
            alt=""
            className="thumbnail size-9 rounded-control object-contain"
          />
        )}
      </span>
      <a
        href={projectUrl(config.projectName)}
        className={`flex flex-col gap-1 no-underline after:absolute after:inset-0 after:rounded-card focus-visible:outline-none ${focusRing.replaceAll("focus-visible:", "focus-visible:after:")}`}
      >
        <h3 className="project-name text-card font-semibold text-ink">
          {config.projectFullName || config.projectName}
        </h3>
        <p className="font-mono text-small text-ink-muted">
          {config.projectName}
        </p>
      </a>
      {!config.description && isMetadataLoading ? (
        <div aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton className="w-full" />
          <Skeleton className="w-2/3" />
        </div>
      ) : (
        <p className="description line-clamp-2 text-ink-muted">
          {config.description || "No description yet."}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-small text-ink-muted">
        {config.organizationName ? (
          <p className="organization-name min-w-0 truncate">
            by {config.organizationName}
          </p>
        ) : isMetadataLoading ? (
          <Skeleton className="w-32" />
        ) : (
          <span />
        )}
        <div className="links relative z-10 flex shrink-0 items-center gap-1">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              className={`inline-flex size-8 items-center justify-center rounded-control hover:bg-sunken ${focusRing}`}
            >
              <img src={link.src} alt="" className="size-4" />
            </a>
          ))}
        </div>
      </div>
    </article>
  );
};

export default ProjectCard;
