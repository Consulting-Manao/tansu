import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@service/queryClient";
import { Card, CardHeader } from "components/ui";
import CopyButton from "components/utils/CopyButton";
import Markdown from "components/utils/Markdown";
import type { Project } from "../../../../packages/tansu";
import type { ConfigData } from "types/projectConfig";
import { isValidCid } from "utils/contentHashes";
import { getIpfsUrl, ipfsQuery } from "utils/ipfsFunctions";
import { projectKeyHex } from "utils/projectKey";
import RecentProposals from "../governance/RecentProposals";
import LatestCommit from "./LatestCommit";
import { Person } from "./PeopleTab";
import SubProjectsSection from "./SubProjectsSection";

const MAINTAINERS_SHOWN = 3;

const TextButton = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="text-small font-semibold text-link underline-offset-2 hover:underline"
  >
    {children}
  </button>
);

/** A project without code shows its README, from its directory on IPFS. */
const Readme = ({ project }: { project: Project }) => {
  const readmeRead = useQuery(
    {
      ...ipfsQuery(project.config.ipfs, "/README.md"),
      enabled: isValidCid(project.config.ipfs),
    },
    queryClient,
  );
  if (readmeRead.isPending) return null;
  return readmeRead.data ? (
    <Markdown baseUrl={getIpfsUrl(project.config.ipfs)}>
      {readmeRead.data}
    </Markdown>
  ) : (
    <p className="text-ink-muted">No README available.</p>
  );
};

/** What a project is at a glance: its latest commit, its people, its keys. */
const OverviewTab = ({
  project,
  config,
  isSoftware,
  onShowTab,
}: {
  project: Project;
  config: ConfigData;
  /** Undefined while the tansu.toml, which sets the type, is read. */
  isSoftware: boolean | undefined;
  onShowTab: (tab: "code" | "proposals" | "people") => void;
}) => {
  const isOrganization = (project.sub_projects?.length ?? 0) > 0;
  const { maintainers } = project;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        {isSoftware && !isOrganization && (
          <Card>
            <CardHeader
              title="Latest commit"
              action={
                <TextButton onClick={() => onShowTab("code")}>
                  History
                </TextButton>
              }
            />
            <LatestCommit project={project} config={config} />
          </Card>
        )}
        <RecentProposals
          name={project.name}
          action={
            <TextButton onClick={() => onShowTab("proposals")}>
              All proposals
            </TextButton>
          }
        />
        {isSoftware === false && (
          <Card>
            <CardHeader title="README" />
            <Readme project={project} />
          </Card>
        )}
        {isOrganization && <SubProjectsSection project={project} />}
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader
            title="Maintainers"
            action={
              maintainers.length > MAINTAINERS_SHOWN && (
                <TextButton onClick={() => onShowTab("people")}>
                  {`View all ${maintainers.length}`}
                </TextButton>
              )
            }
          />
          <ul className="-mx-2 flex flex-col">
            {maintainers.slice(0, MAINTAINERS_SHOWN).map((address) => (
              <li key={address}>
                <Person address={address} handle={config.handles[address]} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="On chain" />
          <dl className="flex flex-col gap-4 text-small">
            <div className="flex flex-col gap-1">
              <dt className="text-ink-muted">Project name</dt>
              <dd className="font-mono break-all">{project.name}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-ink-muted">Project key</dt>
              <dd className="flex items-start gap-2">
                <code className="min-w-0 font-mono break-all">
                  {projectKeyHex(project.name)}
                </code>
                <CopyButton
                  textToCopy={projectKeyHex(project.name)}
                  size="sm"
                />
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-ink-muted">Configuration</dt>
              <dd>
                <a
                  href={getIpfsUrl(project.config.ipfs, "/tansu.toml")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-link underline-offset-2 hover:underline"
                >
                  tansu.toml
                </a>
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
};

export default OverviewTab;
