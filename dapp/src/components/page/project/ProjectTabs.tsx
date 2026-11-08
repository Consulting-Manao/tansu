import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  badgesQuery,
  projectQuery,
  useProjectConfig,
} from "@service/ProjectService";
import { proposalCountQuery } from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { Loading, Tabs, type TabItem } from "components/ui";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import {
  projectNameFromUrl,
  projectTabFromUrl,
  projectUrl,
  type ProjectTab,
} from "utils/urls";
import ProposalsTab from "../governance/ProposalsTab";
import CodeTab from "./CodeTab";
import OverviewTab from "./OverviewTab";
import PeopleTab from "./PeopleTab";

/**
 * The project page under its head: Overview, Code, Proposals and People,
 * the one shown named by `?tab=`. The tabs show while the project is read
 * (and offline): only a project that does not exist has none.
 */
const ProjectTabs = () => {
  const name = projectNameFromUrl();
  const [tab, setTab] = useState<ProjectTab>(projectTabFromUrl);
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
  const { data: proposalCount } = useQuery(
    { ...proposalCountQuery(name), enabled: !!name },
    queryClient,
  );

  if (!name || project === null) return null;

  const show = (next: ProjectTab) => {
    setTab(next);
    window.history.replaceState(
      window.history.state,
      "",
      projectUrl(name, next),
    );
  };
  // Software-only parts wait for the tansu.toml, which sets the type.
  const isSoftware =
    config && !isConfigLoading ? config.projectType === "SOFTWARE" : undefined;
  const people =
    project &&
    new Set([...project.maintainers, ...Object.values(badges ?? {}).flat()])
      .size;
  const waiting = <Loading />;

  const items: TabItem[] = [
    {
      id: "overview",
      label: "Overview",
      panel:
        project && config ? (
          <OverviewTab
            project={project}
            config={config}
            isSoftware={isSoftware}
            onShowTab={show}
          />
        ) : (
          waiting
        ),
    },
    ...(isSoftware && project && config
      ? [
          {
            id: "code",
            label: "Code",
            panel: <CodeTab project={project} config={config} />,
          },
        ]
      : []),
    {
      id: "proposals",
      label: "Proposals",
      count: proposalCount,
      panel: (
        <ProposalsTab name={name} maintainers={project?.maintainers ?? []} />
      ),
    },
    {
      id: "people",
      label: "People",
      count: people,
      panel:
        project && config ? (
          <PeopleTab
            name={name}
            maintainers={project.maintainers}
            handles={config.handles}
          />
        ) : (
          waiting
        ),
    },
  ];

  return (
    <Tabs
      label="Project"
      layout="page"
      items={items}
      value={tab}
      onChange={(id) => show(id as ProjectTab)}
    />
  );
};

export default withErrorBoundary(ProjectTabs);
