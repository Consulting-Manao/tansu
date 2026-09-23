import { useEffect, useState } from "react";
import type { Project } from "../../../../packages/tansu";
import { isValidCid } from "../../../utils/contentHashes";
import { fetchTomlFromIpfs } from "../../../utils/ipfsFunctions";
import { extractConfigData } from "../../../utils/utils";
import ProjectCard from "./ProjectCard";

/** Shows an on-chain project at once and fills it in from its tansu.toml. */
const OnChainProjectCard = ({ project }: { project: Project }) => {
  const [config, setConfig] = useState(() => extractConfigData({}, project));
  const [loading, setLoading] = useState(() => isValidCid(project.config.ipfs));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const toml = await fetchTomlFromIpfs(project.config.ipfs);
        if (active && toml) setConfig(extractConfigData(toml, project));
      } catch {
        // A malformed tansu.toml keeps the bare card.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [project]);

  return <ProjectCard config={config} isMetadataLoading={loading} />;
};

export default OnChainProjectCard;
