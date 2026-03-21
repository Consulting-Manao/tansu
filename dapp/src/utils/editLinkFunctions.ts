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

interface ParsedRepositoryUrl {
  host: string;
  normalizedUrl: string;
  projectPath: string;
  repoName: string;
  owner: string;
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
      const projectPath = match[2].replace(/\.git$/, "").replace(/^\//, "");
      const segments = projectPath.split("/").filter(Boolean);
      if (segments.length < 2) {
        return undefined;
      }

      const repoName = segments[segments.length - 1] || "";
      const owner = segments[segments.length - 2] || "";

      return {
        host,
        normalizedUrl: `https://${host}/${projectPath}`,
        projectPath,
        repoName,
        owner,
      };
    }

    const parsedUrl = new URL(repoUrl);
    const host = parsedUrl.hostname.toLowerCase();
    const projectPath = parsedUrl.pathname
      .replace(/\.git$/, "")
      .replace(/^\//, "")
      .replace(/\/$/, "");
    const segments = projectPath.split("/").filter(Boolean);
    if (segments.length < 2) {
      return undefined;
    }

    const repoName = segments[segments.length - 1] || "";
    const owner = segments[segments.length - 2] || "";

    return {
      host,
      normalizedUrl: `${parsedUrl.protocol}//${host}/${projectPath}`,
      projectPath,
      repoName,
      owner,
    };
  } catch {
    return undefined;
  }
}

export function getRepositoryProjectPath(
  repoUrl: string | null | undefined,
): string {
  return parseRepositoryUrl(repoUrl)?.projectPath || "";
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

  if (parsed.host === "gitlab.com" || parsed.host.includes("gitlab.")) {
    return `${parsed.normalizedUrl}/-/releases`;
  }

  if (parsed.host === "codeberg.org" || parsed.host === "gitea.com") {
    return `${parsed.normalizedUrl}/releases`;
  }

  return undefined;
}

export function getAuthorRepo(repoUrl: string | null | undefined): {
  username: string | undefined;
  repoName: string | undefined;
} {
  const parsed = parseRepositoryUrl(repoUrl);
  return {
    username: parsed?.owner,
    repoName: parsed?.repoName,
  };
}
