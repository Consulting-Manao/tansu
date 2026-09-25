import { useQueries } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { projectByKeyQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
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
    <div className="px-[16px] lg:px-[72px] py-12 bg-white">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-[18px]">
          <p className="leading-6 text-2xl font-medium text-primary">
            Sub-Projects
          </p>
          <div className="border-t border-[#EEEEEE]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subProjects.map(({ data, isSuccess, isError }, index) =>
            data ? (
              <OnChainProjectCard key={data.name} project={data} />
            ) : (
              <p key={index} className="text-secondary">
                {isSuccess
                  ? "Unknown project"
                  : isError
                    ? "This sub-project could not be read."
                    : "Loading sub-project..."}
              </p>
            ),
          )}
        </div>
      </div>
    </div>
  );
};

export default SubProjectsSection;
