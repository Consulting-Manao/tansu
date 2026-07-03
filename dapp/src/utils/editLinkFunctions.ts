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

const RADICLE_PUBLIC_SEED_HOSTS = ["iris.radicle.network"] as const;

const RADICLE_KNOWN_SEED_HOSTS = new Set<string>(RADICLE_PUBLIC_SEED_HOSTS);

const RADICLE_EXPLORER_HOSTS = new Set(["radicle.network", "app.radicle.xyz"]);
const RADICLE_RID_PATTERN = /^rad:(z[1-9A-HJ-NP-Za-km-z]+)$/;
const RADICLE_SCHEME_PATTERN = /^rad:\/\/(z[1-9A-HJ-NP-Za-km-z]+)\/?$/;
const RADICLE_GIT_PATH_PATTERN = /^\/(z[1-9A-HJ-NP-Za-km-z]+)\.git$/;
const RADICLE_SEED_API_PATH_PATTERN =
  /^\/api\/v1\/repos\/(rad:(z[1-9A-HJ-NP-Za-km-z]+))\/?$/;
const RADICLE_EXPLORER_NODE_PATH_PATTERN =
  /^\/nodes\/([^/]+)\/(rad:(z[1-9A-HJ-NP-Za-km-z]+))\/?$/;

export type RepositoryProvider =
  "github" | "gitlab" | "bitbucket" | "codeberg" | "gitea" | "radicle";

export const SUPPORTED_REPOSITORY_PROVIDERS: RepositoryProvider[] = [
  "github",
  "gitlab",
  "bitbucket",
  "codeberg",
  "gitea",
  "radicle",
];

const REPOSITORY_PROVIDER_BY_HOST: Record<
  string,
  Exclude<RepositoryProvider, "radicle">
> = {
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
  radicle: "/icons/logos/radicle.svg",
};

const REPOSITORY_PROVIDER_LABELS: Record<RepositoryProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  codeberg: "Codeberg",
  gitea: "Gitea",
  radicle: "Radicle",
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
  radicle:
    "https://radicle.network/nodes/iris.radicle.network/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
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
  radicle: "alias",
};

interface ParsedHostedRepositoryUrl {
  kind: "hosted";
  provider: Exclude<RepositoryProvider, "radicle">;
  host: string;
  normalizedUrl: string;
  projectPath: string;
  repoName: string;
  owner: string;
}

interface ParsedRadicleRepositoryUrl {
  kind: "radicle";
  provider: "radicle";
  normalizedUrl: string;
  rid: string;
  seedHost?: string;
}

export type ParsedRepositoryUrl =
  ParsedHostedRepositoryUrl | ParsedRadicleRepositoryUrl;

function decodeRepositoryPathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function getRepositoryRootSegmentsForHost(
  host: string,
  segments: string[],
): string[] | undefined {
  if (host === "gitlab.com") {
    const subresourceIndex = segments.indexOf("-");
    const repositorySegments =
      subresourceIndex >= 0 ? segments.slice(0, subresourceIndex) : segments;
    return repositorySegments.length >= 2 ? repositorySegments : undefined;
  }

  if (SUPPORTED_REPOSITORY_HOSTS.has(host)) {
    return segments.length >= 2 ? segments.slice(0, 2) : undefined;
  }

  return segments.length >= 2 ? segments : undefined;
}

function normalizeRepositoryProjectPath(
  host: string,
  projectPath: string | null | undefined,
): string | undefined {
  if (projectPath == null || typeof projectPath !== "string") {
    return undefined;
  }

  const decodedSegments = projectPath
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeRepositoryPathSegment(segment));

  const repositorySegments = getRepositoryRootSegmentsForHost(
    host,
    decodedSegments,
  );
  if (!repositorySegments) {
    return undefined;
  }

  const normalizedPath = repositorySegments.join("/");

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

function normalizeRadicleRid(value: string): string | undefined {
  const trimmedValue = value.trim();

  const directMatch = trimmedValue.match(RADICLE_RID_PATTERN);
  if (directMatch?.[1]) {
    return `rad:${directMatch[1]}`;
  }

  const schemeMatch = trimmedValue.match(RADICLE_SCHEME_PATTERN);
  if (schemeMatch?.[1]) {
    return `rad:${schemeMatch[1]}`;
  }

  return undefined;
}

function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function isLikelyHostname(value: string): boolean {
  return /^[a-z0-9.-]+$/i.test(value) && value.includes(".");
}

function parseRadicleHttpsUrl(
  parsedUrl: URL,
): Pick<ParsedRadicleRepositoryUrl, "rid" | "seedHost"> | undefined {
  if (parsedUrl.search || parsedUrl.hash) {
    return undefined;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const decodedPathname = decodePathname(parsedUrl.pathname);

  if (RADICLE_EXPLORER_HOSTS.has(host)) {
    const nodesMatch = decodedPathname.match(
      RADICLE_EXPLORER_NODE_PATH_PATTERN,
    );
    if (!nodesMatch?.[1] || !nodesMatch[2]) {
      return undefined;
    }

    const seedHost = nodesMatch[1].toLowerCase();
    if (!isLikelyHostname(seedHost)) {
      return undefined;
    }

    return { rid: nodesMatch[2], seedHost };
  }

  if (!RADICLE_KNOWN_SEED_HOSTS.has(host) && !isLikelyHostname(host)) {
    return undefined;
  }

  const apiMatch = decodedPathname.match(RADICLE_SEED_API_PATH_PATTERN);
  if (apiMatch?.[1]) {
    return { rid: apiMatch[1], seedHost: host };
  }

  const directGitMatch = decodedPathname.match(RADICLE_GIT_PATH_PATTERN);
  if (directGitMatch?.[1]) {
    return { rid: `rad:${directGitMatch[1]}`, seedHost: host };
  }

  return undefined;
}

function parseRadicleRepositoryUrl(
  repoUrl: string,
): ParsedRadicleRepositoryUrl | undefined {
  const normalizedRid = normalizeRadicleRid(repoUrl);
  if (normalizedRid) {
    return {
      kind: "radicle",
      provider: "radicle",
      normalizedUrl: normalizedRid,
      rid: normalizedRid,
    };
  }

  try {
    const parsedUrl = new URL(repoUrl);
    if (
      parsedUrl.protocol !== "https:" ||
      (parsedUrl.port && parsedUrl.port !== "443")
    ) {
      return undefined;
    }

    const parsedRadicleUrl = parseRadicleHttpsUrl(parsedUrl);
    if (!parsedRadicleUrl) {
      return undefined;
    }

    return {
      kind: "radicle",
      provider: "radicle",
      normalizedUrl: parsedRadicleUrl.rid,
      rid: parsedRadicleUrl.rid,
      ...(parsedRadicleUrl.seedHost
        ? { seedHost: parsedRadicleUrl.seedHost }
        : {}),
    };
  } catch {
    return undefined;
  }
}

function getDefaultRadicleSeedHost(): string {
  return RADICLE_PUBLIC_SEED_HOSTS[0];
}

export function buildRadicleBrowseUrl(rid: string, seedHost?: string): string {
  return `https://radicle.network/nodes/${seedHost || getDefaultRadicleSeedHost()}/${encodeURIComponent(rid)}`;
}

export function parseRepositoryUrl(
  repoUrl: string | null | undefined,
): ParsedRepositoryUrl | undefined {
  if (repoUrl == null || typeof repoUrl !== "string") {
    return undefined;
  }

  const radicle = parseRadicleRepositoryUrl(repoUrl);
  if (radicle) {
    return radicle;
  }

  try {
    if (repoUrl.startsWith("git@")) {
      const match = repoUrl.match(/^git@([^:]+):(.+)$/);
      if (!match?.[1] || !match[2]) {
        return undefined;
      }

      const host = match[1].toLowerCase();
      const projectPath = normalizeRepositoryProjectPath(host, match[2]);
      if (!projectPath) {
        return undefined;
      }

      const segments = projectPath.split("/").filter(Boolean);
      const repoName = segments[segments.length - 1] || "";
      const owner = segments[segments.length - 2] || "";
      const provider = REPOSITORY_PROVIDER_BY_HOST[host];
      if (!provider) {
        return undefined;
      }

      return {
        kind: "hosted",
        provider,
        host,
        normalizedUrl: buildNormalizedRepositoryUrl(host, projectPath),
        projectPath,
        repoName,
        owner,
      };
    }

    const parsedUrl = new URL(repoUrl);
    if (parsedUrl.protocol !== "https:") {
      return undefined;
    }
    const host = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.port && parsedUrl.port !== "443") {
      return undefined;
    }

    const projectPath = normalizeRepositoryProjectPath(
      host,
      parsedUrl.pathname,
    );
    if (!projectPath) {
      return undefined;
    }

    const segments = projectPath.split("/").filter(Boolean);
    const repoName = segments[segments.length - 1] || "";
    const owner = segments[segments.length - 2] || "";
    const provider = REPOSITORY_PROVIDER_BY_HOST[host];
    if (!provider) {
      return undefined;
    }

    return {
      kind: "hosted",
      provider,
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

export function normalizeRepositoryUrl(
  repoUrl: string | null | undefined,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  if (
    parsed.kind === "hosted" &&
    !SUPPORTED_REPOSITORY_HOSTS.has(parsed.host)
  ) {
    return undefined;
  }

  return parsed.normalizedUrl;
}

export function isSupportedRepositoryUrl(
  repoUrl: string | null | undefined,
): boolean {
  if (repoUrl == null || typeof repoUrl !== "string") {
    return false;
  }

  if (
    !repoUrl.startsWith("https://") &&
    !repoUrl.startsWith("git@") &&
    !repoUrl.startsWith("rad:") &&
    !repoUrl.startsWith("rad://")
  ) {
    return false;
  }

  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return false;
  }

  if (parsed.kind === "radicle") {
    return true;
  }

  return SUPPORTED_REPOSITORY_HOSTS.has(parsed.host);
}

export function getRepositoryProvider(
  repoUrl: string | null | undefined,
): RepositoryProvider | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  return parsed.provider;
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
  if (provider === "radicle") {
    return "Radicle Alias";
  }

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

export function getRepositoryPrincipalField(
  provider: RepositoryProvider | undefined,
): "github" | "radicle" {
  return provider === "radicle" ? "radicle" : "github";
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
  const parsed = parseRepositoryUrl(repoUrl);
  return parsed?.kind === "hosted" ? parsed.projectPath : "";
}

export function buildRepositoryUrlFromProjectPath(
  repoUrl: string | null | undefined,
  projectPathOverride?: string | null,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed || parsed.kind !== "hosted") {
    return undefined;
  }

  const normalizedOverride =
    normalizeRepositoryProjectPath(parsed.host, projectPathOverride) ||
    parsed.projectPath;
  return buildNormalizedRepositoryUrl(parsed.host, normalizedOverride);
}

export function getRepositoryReleasesUrl(
  repoUrl: string | null | undefined,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed || parsed.kind !== "hosted") {
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

export function getRepositorySeedHost(
  repoUrl: string | null | undefined,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  return parsed?.kind === "radicle" ? parsed.seedHost : undefined;
}

export function getRepositoryRid(
  repoUrl: string | null | undefined,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  return parsed?.kind === "radicle" ? parsed.rid : undefined;
}

export function getRepositoryBrowseUrl(
  repoUrl: string | null | undefined,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  if (parsed.kind === "radicle") {
    return buildRadicleBrowseUrl(parsed.rid, parsed.seedHost);
  }

  return parsed.normalizedUrl;
}

export function getRepositoryCloneCommand(
  repoUrl: string | null | undefined,
): string | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  if (parsed.kind === "radicle") {
    return `rad clone ${parsed.rid}`;
  }

  return `git clone ${parsed.normalizedUrl}`;
}
