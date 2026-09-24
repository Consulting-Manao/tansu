import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { navigate } from "astro:transitions/client";
import { lazy, Suspense, useState } from "react";
import {
  badgesQuery,
  projectQuery,
  useProjectConfig,
} from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import Button from "components/utils/Button";
import Loading from "components/utils/Loading";
import {
  convertGitHubLink,
  getRepositoryIconInfo,
} from "utils/editLinkFunctions";
import { getIpfsUrl } from "utils/ipfsFunctions";
import { projectKeyHex } from "utils/projectKey";
import { connectedPublicKey } from "utils/store";
import { governanceUrl, projectNameFromUrl } from "utils/urls";
import MemberProfileModal from "../dashboard/MemberProfileModal";
import AddBadgeModal from "./AddBadgeModal";
import CommitEvidenceModal from "./CommitEvidenceModal";
import CommitHistory from "./CommitHistory";
import DonateModal from "./DonateModal";
import LatestCommit from "./LatestCommit";
import ManageSubProjectsModal from "./ManageSubProjectsModal";
import SubProjectsSection from "./SubProjectsSection";
import UpdateConfigModal from "./UpdateConfigModal";

const ReadMoreModal = lazy(() => import("./ReadMoreModal"));
const ContributionMetrics = lazy(() => import("./ContributionMetrics"));

const MAINTAINERS_SHOWN = 6;
const BADGE_SECTIONS = [
  ["developer", "Developer"],
  ["triage", "Triage"],
  ["community", "Community"],
] as const;

const truncate = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length)}...` : text;

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="p-[15px_16px] lg:p-[30px_72px] bg-white flex flex-col gap-5">
    <p className="leading-4 text-base text-secondary">{title}</p>
    {children}
  </div>
);

/** The page of the project named in the address (`?name=`). */
const ProjectPage = () => {
  const name = projectNameFromUrl();
  const publicKey = useStore(connectedPublicKey);
  const projectRead = useQuery(
    { ...projectQuery(name), enabled: !!name },
    queryClient,
  );
  const project = projectRead.data;
  const { config, isLoading: isConfigLoading } = useProjectConfig(project);
  const { data: badges } = useQuery(
    { ...badgesQuery(name), enabled: !!project },
    queryClient,
  );

  const [profile, setProfile] = useState<string>();
  const [isReadMoreOpen, setIsReadMoreOpen] = useState(false);
  const [showAllMaintainers, setShowAllMaintainers] = useState(false);
  const [isKeyCopied, setIsKeyCopied] = useState(false);

  if (!name || project === null) {
    return (
      <p className="py-12 text-center text-xl text-primary">
        There is no such project: {name}
      </p>
    );
  }
  if (projectRead.isError) {
    return (
      <div className="py-12 flex flex-col items-center gap-4">
        <p className="text-xl text-primary">
          Could not load the project: {projectRead.error.message}
        </p>
        <Button type="secondary" onClick={() => projectRead.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!project || !config) {
    return (
      <div className="py-12 flex justify-center">
        <Loading />
      </div>
    );
  }

  const isMaintainer = !!publicKey && project.maintainers.includes(publicKey);
  // Software-only parts wait for the tansu.toml, which sets the type.
  const isSoftware = !isConfigLoading && config.projectType === "SOFTWARE";
  const isOrganization = (project.sub_projects?.length ?? 0) > 0;
  const repositoryUrl = config.officials.githubLink || project.config.url;
  const key = projectKeyHex(name);

  // Maintainers' handles, when the tansu.toml lists one per address.
  const handles =
    config.maintainersAddresses.length === config.authorGithubNames.length
      ? Object.fromEntries(
          config.maintainersAddresses.map((address, index) => [
            address,
            config.authorGithubNames[index],
          ]),
        )
      : {};
  const maintainers = showAllMaintainers
    ? project.maintainers
    : project.maintainers.slice(0, MAINTAINERS_SHOWN);

  const tomlLink = (
    <a
      href={getIpfsUrl(project.config.ipfs, "/tansu.toml")}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center space-x-2 hover:underline"
    >
      <img className="w-5 h-5" src="/icons/ipfs.svg" alt="IPFS" />
      <span className="text-sm sm:text-base">tansu.toml</span>
    </a>
  );

  const copyKey = async () => {
    await navigator.clipboard.writeText(key);
    setIsKeyCopied(true);
    setTimeout(() => setIsKeyCopied(false), 1500);
  };

  return (
    <>
      {/* Navigation: 2x2 grid on small screens, one row from md up */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-0 mb-4 md:mb-0">
        <a
          href="/"
          className="flex gap-[14px] items-center min-w-0 shrink-0 whitespace-nowrap transition-colors hover:opacity-80"
        >
          <img src="/icons/back.svg" alt="Back" />
          <p className="leading-5 text-base md:text-xl text-primary">
            Back to Home
          </p>
        </a>
        {isMaintainer && (
          <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:grid-cols-3 md:gap-3">
            <UpdateConfigModal
              project={project}
              config={config}
              isSoftware={isSoftware}
            />
            <AddBadgeModal projectName={name} />
            <ManageSubProjectsModal project={project} />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[1048px] flex flex-col gap-6">
        <div className="py-12 flex flex-col gap-12 bg-[#FFFFFFB8]">
          <div className="px-[16px] lg:px-[72px] flex flex-col gap-9">
            <div className="flex max-lg:flex-col gap-6 items-center">
              <img
                alt="Project Thumbnail"
                src={
                  convertGitHubLink(config.logoImageLink) ||
                  "/fallback-image.jpg"
                }
                className="w-[220px] h-[220px] object-contain"
              />
              <div className="flex flex-col gap-9">
                <div className="flex flex-col gap-3">
                  <p className="text-base sm:text-lg text-secondary">
                    {config.organizationName || "Not available"}
                  </p>
                  <div className="flex gap-[18px]">
                    <p className="text-2xl text-primary">
                      {config.projectFullName || name}
                    </p>
                    <div className="flex items-center gap-3">
                      {repositoryUrl && (
                        <a
                          href={repositoryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={getRepositoryIconInfo(repositoryUrl).src}
                            alt={getRepositoryIconInfo(repositoryUrl).label}
                            className="w-4 h-4"
                          />
                        </a>
                      )}
                      {config.officials.websiteLink && (
                        <a
                          href={config.officials.websiteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src="/icons/logos/web.svg"
                            alt="web"
                            className="w-4 h-4"
                          />
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="text-base sm:text-lg text-secondary">
                    {config.description}
                  </p>
                  {!isConfigLoading && !isSoftware && (
                    <div className="flex items-center gap-3">{tomlLink}</div>
                  )}
                </div>
                {isSoftware && (
                  <LatestCommit
                    project={project}
                    config={config}
                    isOrganization={isOrganization}
                    tomlLink={tomlLink}
                  />
                )}
              </div>
            </div>
            <div className="flex flex-col gap-[18px] sm:flex-row sm:flex-wrap md:flex-nowrap">
              <Button
                icon="/icons/gear-white.svg"
                size="xl"
                className="w-full sm:w-auto"
                onClick={() => navigate(governanceUrl(name))}
              >
                <p className="leading-5 text-base sm:text-xl text-white">
                  Proposals
                </p>
              </Button>
              <DonateModal>
                <Button
                  icon="/icons/heart.svg"
                  size="xl"
                  type="secondary"
                  className="w-full sm:w-auto"
                >
                  Support
                </Button>
              </DonateModal>
              {isSoftware && (
                <>
                  <Button
                    icon="/icons/book.svg"
                    size="xl"
                    type="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => setIsReadMoreOpen(true)}
                  >
                    Read More
                  </Button>
                  <CommitEvidenceModal project={project} config={config} />
                </>
              )}
            </div>
          </div>

          <Section title="On-chain Information">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-secondary uppercase tracking-wide">
                  Project Name
                </p>
                <p className="text-base text-primary font-mono">{name}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-secondary uppercase tracking-wide">
                  Project Key
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-primary font-mono bg-gray-50 px-2 py-1 rounded break-all leading-relaxed">
                    {key}
                  </code>
                  <button
                    className="shrink-0 p-1 rounded hover:bg-gray-100 transition-colors"
                    title="Copy project key"
                    onClick={copyKey}
                  >
                    <img
                      src={
                        isKeyCopied
                          ? "/icons/check.svg"
                          : "/icons/clipboard.svg"
                      }
                      alt="Copy"
                      className="w-4 h-4"
                    />
                  </button>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Maintainers">
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-9 p-4">
              {maintainers.map((address) => (
                <li
                  key={address}
                  className="flex flex-col gap-2 mb-4 p-3 bg-gray-50 rounded-md cursor-pointer"
                  title={address}
                  onClick={() => setProfile(address)}
                >
                  {handles[address] ? (
                    <>
                      <p className="leading-6 text-xl text-primary">
                        @{handles[address]}
                      </p>
                      <p className="leading-[14px] text-sm text-secondary underline">
                        ({truncate(address, 16)})
                      </p>
                    </>
                  ) : (
                    <p className="leading-6 text-xl text-primary truncate underline">
                      {truncate(address, 20)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {project.maintainers.length > MAINTAINERS_SHOWN && (
              <div className="flex">
                <button
                  className="leading-[18px] text-lg font-[450] text-primary underline"
                  onClick={() => setShowAllMaintainers(!showAllMaintainers)}
                >
                  {showAllMaintainers ? "Less" : "View All"}
                </button>
              </div>
            )}
          </Section>

          <Section title="Community badges">
            <div className="flex flex-col gap-4 p-4">
              {BADGE_SECTIONS.map(
                ([badge, label]) =>
                  !!badges?.[badge].length && (
                    <div key={badge}>
                      <p className="leading-4 text-base text-secondary">
                        {label}
                      </p>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-9">
                        {badges[badge].map((address) => (
                          <li
                            key={address}
                            className="relative cursor-pointer p-3 bg-gray-50 rounded-md"
                            onClick={() => setProfile(address)}
                          >
                            <p className="leading-[14px] text-sm text-primary truncate underline">
                              {truncate(address, 20)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
              )}
            </div>
          </Section>

          {isSoftware && !isOrganization && repositoryUrl && (
            <div className="bg-white w-full">
              <Suspense fallback={null}>
                <ContributionMetrics
                  repoUrl={repositoryUrl}
                  maintainerHandles={config.authorGithubNames}
                />
              </Suspense>
            </div>
          )}
          {!isConfigLoading && (
            <CommitHistory
              project={project}
              config={config}
              isSoftware={isSoftware}
            />
          )}
          {isOrganization && <SubProjectsSection project={project} />}
        </div>
      </div>

      {isReadMoreOpen && (
        <Suspense fallback={null}>
          <ReadMoreModal
            isOpen
            onClose={() => setIsReadMoreOpen(false)}
            projectData={{
              name,
              description: config.description,
              organization: config.organizationName,
              logoImageLink: convertGitHubLink(config.logoImageLink),
              githubUrl: repositoryUrl,
              websiteUrl: config.officials.websiteLink,
            }}
          />
        </Suspense>
      )}
      {profile && (
        <MemberProfileModal
          address={profile}
          onClose={() => setProfile(undefined)}
        />
      )}
    </>
  );
};

export default ProjectPage;
