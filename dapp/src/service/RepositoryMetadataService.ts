/**
 * Repository metadata, read without authentication from the public APIs of
 * GitHub, GitLab, Bitbucket, Gitea/Codeberg and Radicle seeds, as queries.
 */
import { queryOptions } from "@tanstack/react-query";
import type { FormattedCommit } from "../types/github";
import {
  buildRadicleBrowseUrl,
  parseRepositoryUrl,
  RADICLE_PUBLIC_SEED_HOSTS,
  type ParsedHostedRepositoryUrl,
  type ParsedRadicleRepositoryUrl,
  type ParsedRepositoryUrl,
} from "../utils/editLinkFunctions";
import { fetchWithin } from "../utils/deadline";

interface GitHistoryCommit {
  sha: string;
  authorName: string;
  authorDate: string;
  message: string;
  commitUrl?: string;
  authorUrl?: string;
}

interface GitCommitDetails {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
    author: { name: string; email?: string; date: string };
    committer: { name: string; email?: string; date: string };
  };
}

interface RadicleRepoPayload {
  payloads?: {
    "xyz.radicle.project"?: {
      data?: {
        defaultBranch?: string;
      };
      meta?: {
        head?: string;
      };
    };
  };
}

interface RadicleBlobResponse {
  binary?: boolean;
  content?: string;
}

const README_CANDIDATES = [
  "README.md",
  "README.MD",
  "README",
  "Readme.md",
  "readme.md",
];

const MINUTE = 60_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/** A provider answered with an error status. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    host: string,
  ) {
    super(`${host} API request failed with status ${status}`);
  }
}

/** Queries retry network errors, timeouts, rate limits and 5xx, twice. */
const retryTransient = (failures: number, error: Error) =>
  failures < 2 &&
  !(error instanceof HttpError && !RETRYABLE_STATUS_CODES.has(error.status));

function getRadicleSeedHosts(repo: ParsedRadicleRepositoryUrl): string[] {
  return Array.from(
    new Set([repo.seedHost, ...RADICLE_PUBLIC_SEED_HOSTS]),
  ).filter((host): host is string => Boolean(host));
}

function getRadicleRepoBrowseUrl(repo: ParsedRadicleRepositoryUrl): string {
  return buildRadicleBrowseUrl(repo.rid, repo.seedHost);
}

function groupCommitsByDate(commits: FormattedCommit[]) {
  const groupedCommits = commits.reduce(
    (acc: Record<string, FormattedCommit[]>, commit) => {
      const date = new Date(commit.commit_date).toISOString().split("T")[0];
      if (!date) {
        return acc;
      }

      if (!acc[date]) {
        acc[date] = [];
      }

      acc[date].push(commit);
      return acc;
    },
    {},
  );

  return Object.entries(groupedCommits).map(([date, grouped]) => ({
    date,
    commits: grouped as FormattedCommit[],
  }));
}

function formatCommits(commits: GitHistoryCommit[]) {
  return commits.map((commit) => ({
    message: commit.message,
    author: {
      name: commit.authorName,
      html_url: commit.authorUrl || "",
    },
    commit_date: commit.authorDate,
    html_url: commit.commitUrl || "",
    sha: commit.sha,
  }));
}

function getEncodedRepositorySegments(repo: ParsedHostedRepositoryUrl) {
  return {
    owner: encodeURIComponent(repo.owner),
    repoName: encodeURIComponent(repo.repoName),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithin(url, init);
  if (!response.ok) {
    throw new HttpError(response.status, new URL(url).hostname);
  }

  return (await response.json()) as T;
}

async function fetchMaybeJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | undefined> {
  const response = await fetchWithin(url, init);
  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new HttpError(response.status, new URL(url).hostname);
  }

  return (await response.json()) as T;
}

async function fetchRadicleJsonFromSeeds<T>(
  repo: ParsedRadicleRepositoryUrl,
  buildUrl: (seedHost: string) => string,
): Promise<{ payload: T; seedHost: string } | undefined> {
  let lastError: Error | undefined;

  for (const seedHost of getRadicleSeedHosts(repo)) {
    const response = await fetchWithin(buildUrl(seedHost));
    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      lastError = new HttpError(response.status, seedHost);
      continue;
    }

    // The raw file URLs of this repository point at the seed that has it.
    repo.seedHost = seedHost;
    return {
      payload: (await response.json()) as T,
      seedHost,
    };
  }

  if (lastError) {
    throw lastError;
  }

  return undefined;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getRadicleRepoPayload(
  repo: ParsedRadicleRepositoryUrl,
): Promise<RadicleRepoPayload | undefined> {
  const result = await fetchRadicleJsonFromSeeds<RadicleRepoPayload>(
    repo,
    (seedHost) =>
      `https://${seedHost}/api/v1/repos/${encodeURIComponent(repo.rid)}`,
  );
  return result?.payload;
}

async function getRadicleHead(
  repo: ParsedRadicleRepositoryUrl,
): Promise<string | undefined> {
  const payload = await getRadicleRepoPayload(repo);
  return payload?.payloads?.["xyz.radicle.project"]?.meta?.head;
}

async function getProviderCommitHistory(
  repo: ParsedRepositoryUrl,
  page: number,
  perPage: number,
): Promise<GitHistoryCommit[]> {
  switch (repo.provider) {
    case "github":
      return getGithubHistory(repo, page, perPage);
    case "gitlab":
      return getGitlabHistory(repo, page, perPage);
    case "bitbucket":
      return getBitbucketHistory(repo, page, perPage);
    case "codeberg":
    case "gitea":
      return getGiteaHistory(repo, page, perPage);
    case "radicle":
      return getRadicleHistory(repo, page, perPage);
  }
}

async function getProviderCommitData(
  repo: ParsedRepositoryUrl,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  switch (repo.provider) {
    case "github":
      return getGithubCommit(repo, sha);
    case "gitlab":
      return getGitlabCommit(repo, sha);
    case "bitbucket":
      return getBitbucketCommit(repo, sha);
    case "codeberg":
    case "gitea":
      return getGiteaCommit(repo, sha);
    case "radicle":
      return getRadicleCommit(repo, sha);
  }
}

async function getProviderReadme(
  repo: ParsedRepositoryUrl,
): Promise<string | undefined> {
  switch (repo.provider) {
    case "github":
      return getGithubReadme(repo);
    case "gitlab":
      return getGitlabReadme(repo);
    case "bitbucket":
      return getBitbucketReadme(repo);
    case "codeberg":
    case "gitea":
      return getGiteaReadme(repo);
    case "radicle":
      return getRadicleReadme(repo);
  }
}

async function getGithubHistory(
  repo: ParsedHostedRepositoryUrl,
  page: number,
  perPage: number,
): Promise<GitHistoryCommit[]> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const url = new URL(
    `https://api.github.com/repos/${owner}/${repoName}/commits`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const payload = await fetchJson<any[]>(url.toString(), {
    headers: { Accept: "application/vnd.github+json" },
  });

  return payload.map((entry) => ({
    sha: entry.sha,
    authorName: entry.commit?.author?.name || "",
    authorDate: entry.commit?.author?.date || "",
    message: entry.commit?.message || "",
    commitUrl: entry.html_url || `${repo.normalizedUrl}/commit/${entry.sha}`,
    authorUrl: entry.author?.html_url || "",
  }));
}

async function getGithubCommit(
  repo: ParsedHostedRepositoryUrl,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const payload = await fetchMaybeJson<any>(
    `https://api.github.com/repos/${owner}/${repoName}/commits/${encodeURIComponent(sha)}`,
    {
      headers: { Accept: "application/vnd.github+json" },
    },
  );
  if (!payload) {
    return undefined;
  }

  return {
    sha: payload.sha,
    html_url: payload.html_url || `${repo.normalizedUrl}/commit/${payload.sha}`,
    commit: {
      message: payload.commit?.message || "",
      author: {
        name: payload.commit?.author?.name || "",
        email: payload.commit?.author?.email || "",
        date: payload.commit?.author?.date || "",
      },
      committer: {
        name: payload.commit?.committer?.name || "",
        email: payload.commit?.committer?.email || "",
        date: payload.commit?.committer?.date || "",
      },
    },
  };
}

async function getGithubReadme(
  repo: ParsedHostedRepositoryUrl,
): Promise<string | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const response = await fetchWithin(
    `https://api.github.com/repos/${owner}/${repoName}/readme`,
    {
      headers: { Accept: "application/vnd.github.raw+json" },
    },
  );
  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new HttpError(response.status, "api.github.com");
  }

  return response.text();
}

async function getGitlabHistory(
  repo: ParsedHostedRepositoryUrl,
  page: number,
  perPage: number,
): Promise<GitHistoryCommit[]> {
  const project = encodeURIComponent(repo.projectPath);
  const url = new URL(
    `https://gitlab.com/api/v4/projects/${project}/repository/commits`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const payload = await fetchJson<any[]>(url.toString());

  return payload.map((entry) => ({
    sha: entry.id,
    authorName: entry.author_name || "",
    authorDate: entry.authored_date || entry.created_at || "",
    message: entry.message || entry.title || "",
    commitUrl: entry.web_url || `${repo.normalizedUrl}/-/commit/${entry.id}`,
  }));
}

async function getGitlabCommit(
  repo: ParsedHostedRepositoryUrl,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  const project = encodeURIComponent(repo.projectPath);
  const payload = await fetchMaybeJson<any>(
    `https://gitlab.com/api/v4/projects/${project}/repository/commits/${encodeURIComponent(sha)}`,
  );
  if (!payload) {
    return undefined;
  }

  return {
    sha: payload.id,
    html_url: payload.web_url || `${repo.normalizedUrl}/-/commit/${payload.id}`,
    commit: {
      message: payload.message || payload.title || "",
      author: {
        name: payload.author_name || "",
        email: payload.author_email || "",
        date: payload.authored_date || payload.created_at || "",
      },
      committer: {
        name: payload.committer_name || payload.author_name || "",
        email: payload.committer_email || "",
        date: payload.committed_date || payload.authored_date || "",
      },
    },
  };
}

async function getGitlabReadme(
  repo: ParsedHostedRepositoryUrl,
): Promise<string | undefined> {
  const project = encodeURIComponent(repo.projectPath);

  for (const candidate of README_CANDIDATES) {
    const response = await fetchWithin(
      `https://gitlab.com/api/v4/projects/${project}/repository/files/${encodeURIComponent(candidate)}/raw?ref=HEAD`,
    );
    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      throw new HttpError(response.status, "gitlab.com");
    }

    return response.text();
  }

  return undefined;
}

async function getBitbucketHistory(
  repo: ParsedHostedRepositoryUrl,
  page: number,
  perPage: number,
): Promise<GitHistoryCommit[]> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const url = new URL(
    `https://api.bitbucket.org/2.0/repositories/${owner}/${repoName}/commits`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("pagelen", String(perPage));

  const payload = await fetchJson<{ values: any[] }>(url.toString());

  return payload.values.map((entry) => ({
    sha: entry.hash,
    authorName: entry.author?.user?.display_name || entry.author?.raw || "",
    authorDate: entry.date || "",
    message: entry.message || "",
    commitUrl:
      entry.links?.html?.href || `${repo.normalizedUrl}/commits/${entry.hash}`,
  }));
}

async function getBitbucketCommit(
  repo: ParsedHostedRepositoryUrl,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const payload = await fetchMaybeJson<any>(
    `https://api.bitbucket.org/2.0/repositories/${owner}/${repoName}/commit/${encodeURIComponent(sha)}`,
  );
  if (!payload) {
    return undefined;
  }

  const authorName =
    payload.author?.user?.display_name || payload.author?.raw || "";

  return {
    sha: payload.hash,
    html_url:
      payload.links?.html?.href ||
      `${repo.normalizedUrl}/commits/${payload.hash}`,
    commit: {
      message: payload.message || "",
      author: {
        name: authorName,
        email: "",
        date: payload.date || "",
      },
      committer: {
        name: authorName,
        email: "",
        date: payload.date || "",
      },
    },
  };
}

async function getBitbucketReadme(
  repo: ParsedHostedRepositoryUrl,
): Promise<string | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  for (const candidate of README_CANDIDATES) {
    const response = await fetchWithin(
      `https://api.bitbucket.org/2.0/repositories/${owner}/${repoName}/src/HEAD/${encodeURIComponent(candidate)}`,
    );
    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      throw new HttpError(response.status, "api.bitbucket.org");
    }

    return response.text();
  }

  return undefined;
}

async function getGiteaHistory(
  repo: ParsedHostedRepositoryUrl,
  page: number,
  perPage: number,
): Promise<GitHistoryCommit[]> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const url = new URL(
    `https://${repo.host}/api/v1/repos/${owner}/${repoName}/commits`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(perPage));

  const payload = await fetchJson<any[]>(url.toString());

  return payload.map((entry) => ({
    sha: entry.sha,
    authorName: entry.commit?.author?.name || entry.author?.login || "",
    authorDate: entry.commit?.author?.date || "",
    message: entry.commit?.message || "",
    commitUrl: entry.html_url || `${repo.normalizedUrl}/commit/${entry.sha}`,
  }));
}

async function getGiteaCommit(
  repo: ParsedHostedRepositoryUrl,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const payload = await fetchMaybeJson<any>(
    `https://${repo.host}/api/v1/repos/${owner}/${repoName}/commits/${encodeURIComponent(sha)}`,
  );
  if (!payload) {
    return undefined;
  }

  return {
    sha: payload.sha,
    html_url: payload.html_url || `${repo.normalizedUrl}/commit/${payload.sha}`,
    commit: {
      message: payload.commit?.message || "",
      author: {
        name: payload.commit?.author?.name || payload.author?.login || "",
        email: payload.commit?.author?.email || "",
        date: payload.commit?.author?.date || "",
      },
      committer: {
        name: payload.commit?.committer?.name || "",
        email: payload.commit?.committer?.email || "",
        date: payload.commit?.committer?.date || "",
      },
    },
  };
}

async function getGiteaReadme(
  repo: ParsedHostedRepositoryUrl,
): Promise<string | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  for (const candidate of README_CANDIDATES) {
    const candidatePath = encodeURIComponent(candidate);
    for (const url of [
      `https://${repo.host}/api/v1/repos/${owner}/${repoName}/contents/${candidatePath}?ref=HEAD`,
      `https://${repo.host}/api/v1/repos/${owner}/${repoName}/contents/${candidatePath}`,
    ]) {
      const payload = await fetchMaybeJson<any>(url);
      if (!payload || typeof payload.content !== "string") {
        continue;
      }

      return decodeBase64Utf8(payload.content);
    }
  }

  return undefined;
}

async function getRadicleHistory(
  repo: ParsedRadicleRepositoryUrl,
  page: number,
  perPage: number,
): Promise<GitHistoryCommit[]> {
  const result = await fetchRadicleJsonFromSeeds<any[]>(repo, (seedHost) => {
    const url = new URL(
      `https://${seedHost}/api/v1/repos/${encodeURIComponent(repo.rid)}/commits`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    return url.toString();
  });

  if (!result) {
    return [];
  }

  return result.payload.map((entry) => ({
    sha: entry.id,
    authorName: entry.author?.name || "",
    authorDate: entry.committer?.time
      ? new Date(entry.committer.time * 1000).toISOString()
      : "",
    message: entry.summary || entry.description || "",
    commitUrl: getRadicleRepoBrowseUrl(repo),
  }));
}

async function getRadicleCommit(
  repo: ParsedRadicleRepositoryUrl,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  const result = await fetchRadicleJsonFromSeeds<any>(
    repo,
    (seedHost) =>
      `https://${seedHost}/api/v1/repos/${encodeURIComponent(repo.rid)}/commits/${encodeURIComponent(sha)}`,
  );
  const payload = result?.payload?.commit;
  if (!payload) {
    return undefined;
  }

  const committedAt = payload.committer?.time
    ? new Date(payload.committer.time * 1000).toISOString()
    : "";

  return {
    sha: payload.id,
    html_url: getRadicleRepoBrowseUrl(repo),
    commit: {
      message: payload.description
        ? `${payload.summary || ""}\n\n${payload.description}`.trim()
        : payload.summary || "",
      author: {
        name: payload.author?.name || "",
        email: payload.author?.email || "",
        date: committedAt,
      },
      committer: {
        name: payload.committer?.name || "",
        email: payload.committer?.email || "",
        date: committedAt,
      },
    },
  };
}

async function getRadicleReadme(
  repo: ParsedRadicleRepositoryUrl,
): Promise<string | undefined> {
  const head = await getRadicleHead(repo);
  if (!head) {
    return undefined;
  }

  for (const candidate of README_CANDIDATES) {
    const result = await fetchRadicleJsonFromSeeds<RadicleBlobResponse>(
      repo,
      (seedHost) =>
        `https://${seedHost}/api/v1/repos/${encodeURIComponent(repo.rid)}/blob/${encodeURIComponent(head)}/${encodeURIComponent(candidate)}`,
    );

    if (!result?.payload?.content || result.payload.binary) {
      continue;
    }

    return result.payload.content;
  }

  return undefined;
}

/** A page of a repository's commits, grouped by day; `null` for no host. */
export const commitHistoryQuery = (repoUrl: string, page = 1, perPage = 30) =>
  queryOptions({
    queryKey: ["repo", repoUrl, "history", page, perPage],
    queryFn: async () => {
      const repo = parseRepositoryUrl(repoUrl);
      if (!repo) return null;
      const commits = await getProviderCommitHistory(repo, page, perPage);
      return groupCommitsByDate(formatCommits(commits));
    },
    staleTime: 60 * MINUTE,
    retry: retryTransient,
  });

/** One commit; `null` when the repository does not have it. */
export const repoCommitQuery = (repoUrl: string, sha: string) =>
  queryOptions({
    queryKey: ["repo", repoUrl, "commit", sha],
    queryFn: async () => {
      const repo = parseRepositoryUrl(repoUrl);
      return (repo && (await getProviderCommitData(repo, sha))) ?? null;
    },
    staleTime: 60 * MINUTE,
    retry: retryTransient,
  });

/** The hash of the repository's newest commit. */
export const repoHeadQuery = (repoUrl: string) =>
  queryOptions({
    queryKey: ["repo", repoUrl, "head"],
    queryFn: async () => {
      const repo = parseRepositoryUrl(repoUrl);
      if (!repo) return null;
      const [latest] = await getProviderCommitHistory(repo, 1, 1);
      return latest?.sha ?? null;
    },
    staleTime: MINUTE,
    retry: retryTransient,
  });

/** The README, with the base URL its relative links resolve against. */
export const repoReadmeQuery = (repoUrl: string) =>
  queryOptions({
    queryKey: ["repo", repoUrl, "readme"],
    queryFn: async () => {
      const repo = parseRepositoryUrl(repoUrl);
      const content = repo && (await getProviderReadme(repo));
      if (!repo || !content) return null;
      return { content, rawBaseUrl: await getReadmeRawBaseUrl(repo) };
    },
    staleTime: 60 * MINUTE,
    retry: retryTransient,
  });

async function getReadmeRawBaseUrl(repo: ParsedRepositoryUrl): Promise<string> {
  if (repo.provider === "radicle") {
    const head = await getRadicleHead(repo);
    if (!head || !repo.seedHost) {
      return "";
    }

    return `https://${repo.seedHost}/raw/${encodeURIComponent(repo.rid)}/${encodeURIComponent(head)}`;
  }

  const { owner, repoName } = getEncodedRepositorySegments(repo);
  switch (repo.provider) {
    case "github":
      return `https://raw.githubusercontent.com/${owner}/${repoName}/HEAD`;
    case "gitlab":
      return `https://gitlab.com/${repo.projectPath}/-/raw/HEAD`;
    case "bitbucket":
      return `https://bitbucket.org/${owner}/${repoName}/raw/HEAD`;
    case "codeberg":
    case "gitea":
      return `https://${repo.host}/${repo.projectPath}/raw/branch/HEAD`;
  }
}
