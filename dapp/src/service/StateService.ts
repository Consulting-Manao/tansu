import * as pkg from "js-sha3";
import { Buffer } from "buffer";
import type { Project } from "../../packages/tansu";
import type { ConfigData } from "../types/projectConfig";
import { projectState as projectStateStore } from "utils/store";
import { projectInfo as projectInfoStore } from "utils/store";
import { projectRepoInfo as projectRepoInfoStore } from "utils/store";
import { projectLatestSha as projectLatestShaStore } from "utils/store";
import { configData as configDataStore } from "utils/store";

const { keccak256 } = pkg;

const projectState: {
  project_name: string | undefined;
  project_id: Buffer | undefined;
} = {
  project_name: undefined,
  project_id: undefined,
};

const projectInfo: {
  project_maintainers: string[];
  project_config_url: string;
  project_config_ipfs: string;
} = {
  project_maintainers: [],
  project_config_url: "",
  project_config_ipfs: "",
};

const projectRepoInfo: {
  project_url: string;
} = {
  project_url: "",
};

const projectLatestSha: {
  sha: string;
} = {
  sha: "",
};

// Add this new type definition

// Add this new state variable
let configData: ConfigData | undefined = undefined;

/**
 * Reset all local project-related state
 */
function refreshLocalStorage(): void {
  if (typeof window !== "undefined") {
    projectState.project_name = undefined;
    projectState.project_id = undefined;

    projectInfo.project_maintainers = [];
    projectInfo.project_config_url = "";
    projectInfo.project_config_ipfs = "";

    projectRepoInfo.project_url = "";

    projectLatestSha.sha = "";

    configData = undefined;
  }
}

/**
 * Set project ID (hashed from project name)
 */
function setProjectId(project_name: string): void {
  projectState.project_name = project_name;

  projectState.project_id = Buffer.from(
    keccak256.create().update(project_name.toLowerCase()).digest(),
  );

  if (typeof window !== "undefined") {
    projectStateStore.set(
      JSON.stringify({
        project_name: projectState.project_name,
        project_id: projectState.project_id?.toString("hex"),
      }),
    );
  }
}

/**
 * Set project info
 */
function setProject(project: Project): void {
  projectInfo.project_maintainers = project.maintainers ?? [];
  projectInfo.project_config_url = project.config.url ?? "";
  projectInfo.project_config_ipfs = project.config.ipfs ?? "";

  if (!project.sub_projects) {
    project.sub_projects = [];
  }

  if (typeof window !== "undefined") {
    projectInfoStore.set(projectInfo);
  }
}

/**
 * Load project info safely
 */
function loadProjectInfo(): Project | undefined {
  if (
    projectInfo.project_maintainers.length === 0 ||
    projectInfo.project_config_ipfs === "" ||
    !projectState.project_name
  ) {
    return undefined;
  }

  return {
    maintainers: projectInfo.project_maintainers,
    name: projectState.project_name,
    config: {
      url: projectInfo.project_config_url,
      ipfs: projectInfo.project_config_ipfs,
    },
    sub_projects: [],
  };
}

/**
 * Set project repository URL
 */
function setProjectRepoUrl(url: string): void {
  projectRepoInfo.project_url = url;

  if (typeof window !== "undefined") {
    projectRepoInfoStore.set(projectRepoInfo);
  }
}

/**
 * Load project repository URL
 */
function loadProjectRepoUrl(): string | undefined {
  return projectRepoInfo.project_url || undefined;
}

/**
 * Latest SHA
 */
function setProjectLatestSha(sha: string): void {
  projectLatestSha.sha = sha;

  if (typeof window !== "undefined") {
    projectLatestShaStore.set(projectLatestSha);
  }
}

function loadProjectLatestSha(): string | undefined {
  return projectLatestSha.sha || undefined;
}

/**
 * Config data
 */
function setConfigData(data: Partial<ConfigData>): void {
  if (!configData) {
    configData = data as ConfigData;
  } else {
    configData = { ...configData, ...data };
  }

  if (typeof window !== "undefined") {
    configDataStore.set(configData);
  }
}

function loadConfigData(): ConfigData | undefined {
  return configData;
}

/**
 * Get current project ID
 */
function loadedProjectId(): Buffer | undefined {
  return projectState.project_id;
}

/**
 * Get current project name
 */
function loadProjectName(): string | undefined {
  return projectState.project_name;
}

export {
  setProjectId,
  setProject,
  setProjectRepoUrl,
  loadedProjectId,
  loadProjectInfo,
  loadProjectRepoUrl,
  setProjectLatestSha,
  loadProjectLatestSha,
  loadProjectName,
  setConfigData,
  loadConfigData,
  refreshLocalStorage,
};
