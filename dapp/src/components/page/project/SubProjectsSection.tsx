import { useQueries } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { projectByKeyQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { Card, CardHeader } from "components/ui";
import type { Project } from "../../../../packages/tansu";
import OnChainProjectCard from "../dashboard/OnChainProjectCard";

/** An organization's projects: each card shows as soon as it is read. */
const SubProjectsSection = ({ project }: { project: Project }) => {
  const subProjects = useQueries(
    {
      queries: (project.sub_projects ?? []).map((key) =>
        projectByKeyQuery(Buffer.from(key).toString("hex")),
      ),
    },
    queryClient,
  );

  return (
    <Card>
      <CardHeader title="Sub-projects" />
      <div className="grid gap-4 sm:grid-cols-2">
        {subProjects.map(({ data, isSuccess, isError }, index) =>
          data ? (
            <OnChainProjectCard key={data.name} project={data} />
          ) : (
            <p key={index} className="text-ink-muted">
              {isSuccess
                ? "Unknown project"
                : isError
                  ? "This sub-project could not be read."
                  : "Loading sub-project…"}
            </p>
          ),
        )}
      </div>
    </Card>
  );
};

export default SubProjectsSection;
