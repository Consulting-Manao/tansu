export enum ProjectType {
  SOFTWARE = "SOFTWARE",
  GENERIC = "GENERIC",
}

export interface ConfigData {
  projectName: string;
  projectFullName: string;
  projectType: ProjectType;
  logoImageLink: string;
  thumbnailImageLink: string;
  description: string;
  organizationName: string;
  officials: {
    websiteLink: string;
    githubLink?: string;
  };
  socialLinks: {
    twitter: string;
    telegram: string;
    discord: string;
  };
  /** Each maintainer's handle on the repository host, by address. */
  handles: Record<string, string>;
  readmeContent?: string;
}
