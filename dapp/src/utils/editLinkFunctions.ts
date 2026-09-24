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

export type RepositoryProvider =
  "github" | "gitlab" | "bitbucket" | "codeberg" | "gitea" | "radicle";

/**
 * The providers, and what the forms show for each. A provider's icon is
 * `/icons/logos/<provider>.svg`; `releases` is its releases page, under the
 * repository's URL.
 */
const PROVIDERS: Record<
  RepositoryProvider,
  {
    label: string;
    repoPlaceholder: string;
    handlePlaceholder: string;
    releases?: string;
  }
> = {
  github: {
    label: "GitHub",
    repoPlaceholder: "https://github.com/owner/repo",
    handlePlaceholder: "username",
    releases: "/releases",
  },
  gitlab: {
    label: "GitLab",
    repoPlaceholder: "https://gitlab.com/group/project",
    handlePlaceholder: "username",
    releases: "/-/releases",
  },
  bitbucket: {
    label: "Bitbucket",
    repoPlaceholder: "https://bitbucket.org/workspace/repo",
    handlePlaceholder: "workspace-or-user",
  },
  codeberg: {
    label: "Codeberg",
    repoPlaceholder: "https://codeberg.org/owner/repo",
    handlePlaceholder: "username",
    releases: "/releases",
  },
  gitea: {
    label: "Gitea",
    repoPlaceholder: "https://gitea.com/owner/repo",
    handlePlaceholder: "username",
    releases: "/releases",
  },
  radicle: {
    label: "Radicle",
    repoPlaceholder:
      "https://radicle.network/nodes/iris.radicle.network/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
    handlePlaceholder: "alias",
  },
};

export const SUPPORTED_REPOSITORY_PROVIDERS = Object.keys(
  PROVIDERS,
) as RepositoryProvider[];

type HostedProvider = Exclude<RepositoryProvider, "radicle">;

/** Each hosted provider's host. Codeberg runs Gitea, and answers its API. */
const PROVIDER_BY_HOST = new Map<string, HostedProvider>([
  ["github.com", "github"],
  ["gitlab.com", "gitlab"],
  ["bitbucket.org", "bitbucket"],
  ["codeberg.org", "codeberg"],
  ["gitea.com", "gitea"],
]);

/** Seeds that serve public Radicle repositories, for a URL that names none. */
export const RADICLE_PUBLIC_SEED_HOSTS = ["iris.radicle.network"] as const;

const RADICLE_EXPLORER_HOSTS = new Set(["radicle.network", "app.radicle.xyz"]);
const RADICLE_RID_PATTERN = /^rad:(z[1-9A-HJ-NP-Za-km-z]+)$/;
const RADICLE_SCHEME_PATTERN = /^rad:\/\/(z[1-9A-HJ-NP-Za-km-z]+)\/?$/;
const RADICLE_GIT_PATH_PATTERN = /^\/(z[1-9A-HJ-NP-Za-km-z]+)\.git$/;
const RADICLE_SEED_API_PATH_PATTERN =
  /^\/api\/v1\/repos\/(rad:(z[1-9A-HJ-NP-Za-km-z]+))\/?$/;
const RADICLE_EXPLORER_NODE_PATH_PATTERN =
  /^\/nodes\/([^/]+)\/(rad:(z[1-9A-HJ-NP-Za-km-z]+))\/?$/;

export interface ParsedHostedRepositoryUrl {
  kind: "hosted";
  provider: HostedProvider;
  host: string;
  normalizedUrl: string;
  projectPath: string;
  repoName: string;
  owner: string;
}

export interface ParsedRadicleRepositoryUrl {
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

  return segments.length >= 2 ? segments.slice(0, 2) : undefined;
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

  if (!isLikelyHostname(host)) {
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

export function buildRadicleBrowseUrl(rid: string, seedHost?: string): string {
  return `https://radicle.network/nodes/${seedHost || RADICLE_PUBLIC_SEED_HOSTS[0]}/${encodeURIComponent(rid)}`;
}

/** A repository on a supported host, from its path there. */
function parseHostedRepositoryUrl(
  host: string,
  path: string,
): ParsedHostedRepositoryUrl | undefined {
  const provider = PROVIDER_BY_HOST.get(host);
  const projectPath = provider && normalizeRepositoryProjectPath(host, path);
  if (!provider || !projectPath) {
    return undefined;
  }

  const segments = projectPath.split("/");
  return {
    kind: "hosted",
    provider,
    host,
    normalizedUrl: buildNormalizedRepositoryUrl(host, projectPath),
    projectPath,
    repoName: segments[segments.length - 1] || "",
    owner: segments[segments.length - 2] || "",
  };
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

  const ssh = repoUrl.match(/^git@([^:]+):(.+)$/);
  if (ssh?.[1] && ssh[2]) {
    return parseHostedRepositoryUrl(ssh[1].toLowerCase(), ssh[2]);
  }

  try {
    const parsedUrl = new URL(repoUrl);
    if (
      parsedUrl.protocol !== "https:" ||
      (parsedUrl.port && parsedUrl.port !== "443")
    ) {
      return undefined;
    }
    return parseHostedRepositoryUrl(
      parsedUrl.hostname.toLowerCase(),
      parsedUrl.pathname,
    );
  } catch {
    return undefined;
  }
}

export function normalizeRepositoryUrl(
  repoUrl: string | null | undefined,
): string | undefined {
  return parseRepositoryUrl(repoUrl)?.normalizedUrl;
}

/** An https or SSH URL on a supported host, or a Radicle RID or URL. */
export function isSupportedRepositoryUrl(
  repoUrl: string | null | undefined,
): boolean {
  return (
    typeof repoUrl === "string" &&
    /^(https:\/\/|git@|rad:)/.test(repoUrl) &&
    !!parseRepositoryUrl(repoUrl)
  );
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
    src: `/icons/logos/${provider}.svg`,
    label: PROVIDERS[provider].label,
  };
}

export function getRepositoryProviderLabel(
  provider: RepositoryProvider | undefined,
): string {
  return provider ? PROVIDERS[provider].label : "Repository";
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
  return provider ? PROVIDERS[provider].handlePlaceholder : "username";
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
    ? PROVIDERS[provider].repoPlaceholder
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
  if (!parsed) {
    return undefined;
  }

  const releases = PROVIDERS[parsed.provider].releases;
  return releases && `${parsed.normalizedUrl}${releases}`;
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
