export function convertGitHubLink(link: string | null | undefined): string {
  if (link == null || typeof link !== "string") return "";
  const githubFileRegex =
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/;

  const match = link.match(githubFileRegex);

  if (match) {
    const [, owner, repo, path] = match;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${path}`;
  } else {
    return link;
  }
}

const SUPPORTED_REPOSITORY_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
  "gitea.com",
]);

export type RepositoryProvider =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "codeberg"
  | "gitea";

export const SUPPORTED_REPOSITORY_PROVIDERS: RepositoryProvider[] = [
  "github",
  "gitlab",
  "bitbucket",
  "codeberg",
  "gitea",
];

const REPOSITORY_PROVIDER_BY_HOST: Record<string, RepositoryProvider> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
  "codeberg.org": "codeberg",
  "gitea.com": "gitea",
};

const REPOSITORY_PROVIDER_ICON_PATHS: Record<RepositoryProvider, string> = {
  github: "/icons/logos/github.svg",
  gitlab: "/icons/logos/gitlab.svg",
  bitbucket: "/icons/logos/bitbucket.svg",
  codeberg: "/icons/logos/codeberg.svg",
  gitea: "/icons/logos/gitea.svg",
};

const REPOSITORY_PROVIDER_LABELS: Record<RepositoryProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  codeberg: "Codeberg",
  gitea: "Gitea",
};

const REPOSITORY_PROVIDER_REPO_PLACEHOLDERS: Record<
  RepositoryProvider,
  string
> = {
  github: "https://github.com/owner/repo",
  gitlab: "https://gitlab.com/group/project",
  bitbucket: "https://bitbucket.org/workspace/repo",
  codeberg: "https://codeberg.org/owner/repo",
  gitea: "https://gitea.com/owner/repo",
};

const REPOSITORY_PROVIDER_HANDLE_PLACEHOLDERS: Record<
  RepositoryProvider,
  string
> = {
  github: "username",
  gitlab: "username",
  bitbucket: "workspace-or-user",
  codeberg: "username",
  gitea: "username",
};

interface ParsedRepositoryUrl {
  host: string;
  normalizedUrl: string;
  projectPath: string;
  repoName: string;
  owner: string;
}

function hasValidRepositoryPathSegments(
  host: string,
  segments: string[],
): boolean {
  if (host === "gitlab.com") {
    return segments.length >= 2;
  }

  if (SUPPORTED_REPOSITORY_HOSTS.has(host)) {
    return segments.length === 2;
  }

  return segments.length >= 2;
}

function decodeRepositoryPathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeRepositoryProjectPath(
  projectPath: string | null | undefined,
): string | undefined {
  if (projectPath == null || typeof projectPath !== "string") {
    return undefined;
  }

  const normalizedPath = projectPath
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeRepositoryPathSegment(segment))
    .join("/");

  return normalizedPath || undefined;
}

function buildNormalizedRepositoryUrl(
  host: string,
  projectPath: string,
): string {
  const encodedProjectPath = projectPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://${host}/${encodedProjectPath}`;
}

export function parseRepositoryUrl(
  repoUrl: string | null | undefined,
): ParsedRepositoryUrl | undefined {
  if (repoUrl == null || typeof repoUrl !== "string") {
    return undefined;
  }

  try {
    if (repoUrl.startsWith("git@")) {
      const match = repoUrl.match(/^git@([^:]+):(.+)$/);
      if (!match?.[1] || !match[2]) {
        return undefined;
      }

      const host = match[1].toLowerCase();
      const projectPath = normalizeRepositoryProjectPath(match[2]);
      if (!projectPath) {
        return undefined;
      }

      const segments = projectPath.split("/").filter(Boolean);
      if (!hasValidRepositoryPathSegments(host, segments)) {
        return undefined;
      }

      const repoName = segments[segments.length - 1] || "";
      const owner = segments[segments.length - 2] || "";

      return {
        host,
        normalizedUrl: buildNormalizedRepositoryUrl(host, projectPath),
        projectPath,
        repoName,
        owner,
      };
    }

    const parsedUrl = new URL(repoUrl);
    const host = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.port && parsedUrl.port !== "443") {
      return undefined;
    }

    const projectPath = normalizeRepositoryProjectPath(parsedUrl.pathname);
    if (!projectPath) {
      return undefined;
    }

    const segments = projectPath.split("/").filter(Boolean);
    if (!hasValidRepositoryPathSegments(host, segments)) {
      return undefined;
    }

    const repoName = segments[segments.length - 1] || "";
    const owner = segments[segments.length - 2] || "";

    return {
      host,
      normalizedUrl: buildNormalizedRepositoryUrl(host, projectPath),
      projectPath,
      repoName,
      owner,
    };
  } catch {
    return undefined;
  }
}

export function isSupportedRepositoryUrl(
  repoUrl: string | null | undefined,
): boolean {
  if (repoUrl == null || typeof repoUrl !== "string") {
    return false;
  }

  if (!repoUrl.startsWith("https://") && !repoUrl.startsWith("git@")) {
    return false;
  }

  const parsed = parseRepositoryUrl(repoUrl);
  return parsed ? SUPPORTED_REPOSITORY_HOSTS.has(parsed.host) : false;
}

export function getRepositoryProvider(
  repoUrl: string | null | undefined,
): RepositoryProvider | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  return REPOSITORY_PROVIDER_BY_HOST[parsed.host];
}

export function getRepositoryIconInfo(repoUrl: string | null | undefined): {
  provider?: RepositoryProvider;
  src: string;
  label: string;
} {
  const provider = getRepositoryProvider(repoUrl);
  if (!provider) {
    return {
      src: "/icons/git.svg",
      label: "Repository",
    };
  }

  return {
    provider,
    src: REPOSITORY_PROVIDER_ICON_PATHS[provider],
    label: REPOSITORY_PROVIDER_LABELS[provider],
  };
}

export function getRepositoryProviderLabel(
  provider: RepositoryProvider | undefined,
): string {
  return provider ? REPOSITORY_PROVIDER_LABELS[provider] : "Repository";
}

export function getRepositoryHandleLabel(
  provider: RepositoryProvider | undefined,
): string {
  return provider
    ? `${getRepositoryProviderLabel(provider)} Handle`
    : "Maintainer Handle";
}

export function getRepositoryHandlePlaceholder(
  provider: RepositoryProvider | undefined,
): string {
  return provider
    ? REPOSITORY_PROVIDER_HANDLE_PLACEHOLDERS[provider]
    : "username";
}

export function getRepositoryUrlPlaceholder(
  provider: RepositoryProvider | undefined,
): string {
  return provider
    ? REPOSITORY_PROVIDER_REPO_PLACEHOLDERS[provider]
    : "https://provider.example/owner/repo";
}

export function getRepositoryProjectPath(
  repoUrl: string | null | undefined,
): string {
  return parseRepositoryUrl(repoUrl)?.projectPath || "";
}

export function buildRepositoryUrlFromProjectPath(
  repoUrl: string | null | undefined,
  projectPathOverride?: string | null,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  const normalizedOverride =
    normalizeRepositoryProjectPath(projectPathOverride) || parsed.projectPath;
  return buildNormalizedRepositoryUrl(parsed.host, normalizedOverride);
}

export function getRepositoryReleasesUrl(
  repoUrl: string | null | undefined,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  if (parsed.host === "github.com") {
    return `${parsed.normalizedUrl}/releases`;
  }

  if (parsed.host === "gitlab.com") {
    return `${parsed.normalizedUrl}/-/releases`;
  }

  if (parsed.host === "codeberg.org" || parsed.host === "gitea.com") {
    return `${parsed.normalizedUrl}/releases`;
  }

  return undefined;
}
