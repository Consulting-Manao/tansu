import { useStore } from "@nanostores/react";
import cx from "classnames";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { projectQuery, useProjectConfig } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { Button, Skeleton } from "components/ui";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import {
  convertGitHubLink,
  getRepositoryIconInfo,
} from "utils/editLinkFunctions";
import { connectedPublicKey } from "utils/store";
import { projectNameFromUrl } from "utils/urls";
import AddBadgeModal from "./AddBadgeModal";
import DonateModal from "./DonateModal";
import ManageSubProjectsModal from "./ManageSubProjectsModal";
import UpdateConfigModal from "./UpdateConfigModal";

const ReadMoreModal = lazy(() => import("./ReadMoreModal"));

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const BackLink = () => (
  <a
    href="/"
    className="inline-flex items-center gap-1.5 self-start text-ui font-semibold text-band-muted no-underline hover:text-band-ink"
  >
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
      <path
        d="M10 3 5 8l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    Projects
  </a>
);

const Head = ({ children }: { children: ReactNode }) => (
  <div className="flex max-w-[760px] flex-col gap-4 sm:gap-6">
    <BackLink />
    {children}
  </div>
);

const ExternalLink = ({
  href,
  children,
}: {
  href: string;
  children: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-link underline-offset-2 hover:underline"
  >
    {children}
  </a>
);

/** The project page's head, on the band: who, what, and what to do. */
const ProjectHead = () => {
  const name = projectNameFromUrl();
  const publicKey = useStore(connectedPublicKey);
  const projectRead = useQuery(
    { ...projectQuery(name), enabled: !!name },
    queryClient,
  );
  const project = projectRead.data;
  const { config, isLoading: isConfigLoading } = useProjectConfig(project);
  const [isReadMoreOpen, setIsReadMoreOpen] = useState(false);

  if (!name || project === null) {
    return (
      <Head>
        <h1 className="text-section font-bold sm:text-title">
          No such project
        </h1>
        <p className="text-band-muted">There is no such project: {name}</p>
      </Head>
    );
  }
  // A refetch that fails leaves the project as last read.
  if (projectRead.isError && !project) {
    return (
      <Head>
        <h1 className="text-section font-bold break-words sm:text-title">
          {name}
        </h1>
        <p className="text-band-muted" role="alert">
          Could not load the project: {projectRead.error.message}
        </p>
        <Button
          tone="secondary"
          className="self-start"
          onClick={() => projectRead.refetch()}
        >
          Retry
        </Button>
      </Head>
    );
  }

  const isMaintainer =
    !!publicKey && !!project?.maintainers.includes(publicKey);
  const repository = config?.officials.githubLink || project?.config.url;
  const website = config?.officials.websiteLink;
  const logo = config ? convertGitHubLink(config.logoImageLink) : "";

  return (
    <Head>
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Logos are drawn for a light ground: their tile stays white. */}
        <span
          className={cx(
            "flex size-14 shrink-0 items-center justify-center rounded-card shadow-float sm:size-24 sm:rounded-panel",
            logo ? "bg-paper" : "bg-surface",
          )}
        >
          {logo ? (
            <img
              src={logo}
              alt=""
              className="size-9 object-contain sm:size-16"
            />
          ) : (
            <span
              aria-hidden="true"
              className="text-section font-extrabold text-ink sm:text-title"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1 sm:gap-2">
          {config?.organizationName && (
            <p className="font-mono text-label tracking-[0.08em] text-link uppercase">
              {config.organizationName}
            </p>
          )}
          <h1 className="text-section font-extrabold tracking-[-0.02em] break-words text-band-ink sm:text-title">
            {config?.projectFullName || name}
          </h1>
          <p className="flex flex-wrap gap-x-2 font-mono text-small text-band-muted">
            <span>{name}</span>
            {repository && (
              <>
                <span aria-hidden="true">·</span>
                <ExternalLink href={repository}>
                  {getRepositoryIconInfo(repository).label}
                </ExternalLink>
              </>
            )}
            {website && (
              <>
                <span aria-hidden="true">·</span>
                <ExternalLink href={website}>{hostOf(website)}</ExternalLink>
              </>
            )}
          </p>
        </div>
      </div>
      {config ? (
        config.description && (
          <p className="max-w-[34em] font-prose text-prose text-band-muted sm:text-lead">
            {config.description}
          </p>
        )
      ) : (
        <Skeleton className="h-6 w-2/3" />
      )}
      {project && config && (
        <div className="flex flex-wrap gap-3">
          <DonateModal
            name={name}
            maintainers={project.maintainers}
            handles={config.handles}
          >
            <Button tone="secondary">Support the project</Button>
          </DonateModal>
          {!isConfigLoading && config.projectType === "SOFTWARE" && (
            <Button tone="ghost" onClick={() => setIsReadMoreOpen(true)}>
              Read the README
            </Button>
          )}
          {isMaintainer && (
            <>
              <UpdateConfigModal project={project} />
              <AddBadgeModal projectName={name} />
              <ManageSubProjectsModal project={project} />
            </>
          )}
        </div>
      )}
      {isReadMoreOpen && project && config && (
        <Suspense fallback={null}>
          <ReadMoreModal
            isOpen
            onClose={() => setIsReadMoreOpen(false)}
            projectData={{
              name,
              description: config.description,
              organization: config.organizationName,
              logoImageLink: logo,
              githubUrl: repository ?? "",
              websiteUrl: config.officials.websiteLink,
            }}
          />
        </Suspense>
      )}
    </Head>
  );
};

export default withErrorBoundary(ProjectHead);
