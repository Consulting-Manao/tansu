import { lazy, Suspense } from "react";
import type { Project } from "../../../../packages/tansu";
import type { ConfigData } from "types/projectConfig";
import CommitEvidenceModal from "./CommitEvidenceModal";
import CommitHistory from "./CommitHistory";

const ContributionMetrics = lazy(() => import("./ContributionMetrics"));

/** A software project's code: its history, evidence and contributors. */
const CodeTab = ({
  project,
  config,
}: {
  project: Project;
  config: ConfigData;
}) => {
  const isOrganization = (project.sub_projects?.length ?? 0) > 0;
  const repositoryUrl = config.officials.githubLink || project.config.url;

  return (
    <div className="flex flex-col gap-12">
      <CommitHistory
        project={project}
        config={config}
        action={<CommitEvidenceModal project={project} config={config} />}
      />
      {!isOrganization && repositoryUrl && (
        <Suspense fallback={null}>
          <ContributionMetrics
            repoUrl={repositoryUrl}
            maintainerHandles={Object.values(config.handles)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default CodeTab;
