import { useProjectConfig } from "@service/ProjectService";
import type { Project } from "../../../../packages/tansu";
import ProjectCard from "./ProjectCard";

/** Shows an on-chain project at once and fills it in from its tansu.toml. */
const OnChainProjectCard = ({ project }: { project: Project }) => {
  const { config, isLoading } = useProjectConfig(project);
  return <ProjectCard config={config} isMetadataLoading={isLoading} />;
};

export default OnChainProjectCard;
