import type { FormattedCommit } from "../types/github";
import { parseRepositoryUrl } from "../utils/editLinkFunctions";

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

type SupportedProvider = "github" | "gitlab" | "bitbucket" | "gitea";

interface ParsedRepositoryInfo {
  provider: SupportedProvider;
  host: string;
  normalizedUrl: string;
  owner: string;
  projectPath: string;
  repoName: string;
}

const README_CANDIDATES = [
  "README.md",
  "README.MD",
  "README",
  "Readme.md",
  "readme.md",
];

const REQUEST_CACHE_TTL_MS = 30_000;
const MAX_RETRY_ATTEMPTS = 2;
const INITIAL_RETRY_DELAY_MS = 250;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const responseCache = new Map<
  string,
  { expiresAt: number; response: Response }
>();

function getRepositoryInfo(repoUrl: string): ParsedRepositoryInfo | undefined {
  const parsed = parseRepositoryUrl(repoUrl);
  if (!parsed) {
    return undefined;
  }

  const provider = getProviderForHost(parsed.host);
  if (!provider) {
    return undefined;
  }

  return {
    provider,
    host: parsed.host,
    normalizedUrl: parsed.normalizedUrl,
    owner: parsed.owner,
    projectPath: parsed.projectPath,
    repoName: parsed.repoName,
  };
}

function getProviderForHost(host: string): SupportedProvider | undefined {
  if (host === "github.com") {
    return "github";
  }

  if (host === "gitlab.com") {
    return "gitlab";
  }

  if (host === "bitbucket.org") {
    return "bitbucket";
  }

  if (host === "codeberg.org" || host === "gitea.com") {
    return "gitea";
  }

  return undefined;
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

function getEncodedRepositorySegments(repo: ParsedRepositoryInfo) {
  return {
    owner: encodeURIComponent(repo.owner),
    repoName: encodeURIComponent(repo.repoName),
  };
}

function getRequestCacheKey(url: string, init?: RequestInit): string {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const serializedHeaders = Array.from(headers.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");

  return `${method}:${url}:${serializedHeaders}`;
}

function canCacheRequest(init?: RequestInit): boolean {
  return !init?.method || init.method.toUpperCase() === "GET";
}

function getCachedResponse(key: string): Response | undefined {
  const cached = responseCache.get(key);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }

  return cached.response.clone();
}

function shouldRetryResponse(response: Response, attempt: number): boolean {
  return (
    attempt < MAX_RETRY_ATTEMPTS && RETRYABLE_STATUS_CODES.has(response.status)
  );
}

function getRetryDelayMs(attempt: number): number {
  return INITIAL_RETRY_DELAY_MS * 2 ** attempt;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchWithResilience(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const cacheKey = getRequestCacheKey(url, init);
  if (canCacheRequest(init)) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok && canCacheRequest(init)) {
        responseCache.set(cacheKey, {
          expiresAt: Date.now() + REQUEST_CACHE_TTL_MS,
          response: response.clone(),
        });
      }

      if (!shouldRetryResponse(response, attempt)) {
        return response;
      }

      lastError = new Error(
        `${new URL(url).hostname} API request failed with status ${response.status}`,
      );
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        break;
      }
    }

    await sleep(getRetryDelayMs(attempt));
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`${new URL(url).hostname} API request failed`);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithResilience(url, init);
  if (!response.ok) {
    throw new Error(
      `${new URL(url).hostname} API request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

async function fetchMaybeJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | undefined> {
  const response = await fetchWithResilience(url, init);
  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(
      `${new URL(url).hostname} API request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getProviderCommitHistory(
  repo: ParsedRepositoryInfo,
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
    case "gitea":
      return getGiteaHistory(repo, page, perPage);
  }
}

async function getProviderCommitData(
  repo: ParsedRepositoryInfo,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  switch (repo.provider) {
    case "github":
      return getGithubCommit(repo, sha);
    case "gitlab":
      return getGitlabCommit(repo, sha);
    case "bitbucket":
      return getBitbucketCommit(repo, sha);
    case "gitea":
      return getGiteaCommit(repo, sha);
  }
}

async function getProviderReadme(
  repo: ParsedRepositoryInfo,
): Promise<string | undefined> {
  switch (repo.provider) {
    case "github":
      return getGithubReadme(repo);
    case "gitlab":
      return getGitlabReadme(repo);
    case "bitbucket":
      return getBitbucketReadme(repo);
    case "gitea":
      return getGiteaReadme(repo);
  }
}

async function getGithubHistory(
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
): Promise<string | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  const response = await fetchWithResilience(
    `https://api.github.com/repos/${owner}/${repoName}/readme`,
    {
      headers: { Accept: "application/vnd.github.raw+json" },
    },
  );
  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}`);
  }

  return response.text();
}

async function getGitlabHistory(
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
): Promise<string | undefined> {
  const project = encodeURIComponent(repo.projectPath);

  for (const candidate of README_CANDIDATES) {
    const response = await fetchWithResilience(
      `https://gitlab.com/api/v4/projects/${project}/repository/files/${encodeURIComponent(candidate)}/raw?ref=HEAD`,
    );
    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `GitLab API request failed with status ${response.status}`,
      );
    }

    return response.text();
  }

  return undefined;
}

async function getBitbucketHistory(
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
): Promise<string | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  for (const candidate of README_CANDIDATES) {
    const response = await fetchWithResilience(
      `https://api.bitbucket.org/2.0/repositories/${owner}/${repoName}/src/HEAD/${encodeURIComponent(candidate)}`,
    );
    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Bitbucket API request failed with status ${response.status}`,
      );
    }

    return response.text();
  }

  return undefined;
}

async function getGiteaHistory(
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
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
  repo: ParsedRepositoryInfo,
): Promise<string | undefined> {
  const { owner, repoName } = getEncodedRepositorySegments(repo);
  for (const candidate of README_CANDIDATES) {
    const payload = await fetchMaybeJson<any>(
      `https://${repo.host}/api/v1/repos/${owner}/${repoName}/contents/${encodeURIComponent(candidate)}?ref=HEAD`,
    );
    if (!payload || typeof payload.content !== "string") {
      continue;
    }

    return decodeBase64Utf8(payload.content);
  }

  return undefined;
}

async function getCommitHistory(
  repoUrl: string,
  page: number = 1,
  perPage: number = 30,
): Promise<{ date: string; commits: FormattedCommit[] }[] | null> {
  if (!repoUrl) {
    return null;
  }

  try {
    const repo = getRepositoryInfo(repoUrl);
    if (!repo) {
      return null;
    }

    const commits = await getProviderCommitHistory(repo, page, perPage);
    const formattedCommits = formatCommits(commits);

    return groupCommitsByDate(formattedCommits);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to load commit history", error);
    }
    return null;
  }
}

async function getLatestCommitData(
  repoUrl: string,
  sha: string,
): Promise<GitCommitDetails | undefined> {
  if (!repoUrl || !sha) {
    return undefined;
  }

  try {
    const repo = getRepositoryInfo(repoUrl);
    if (!repo) {
      return undefined;
    }

    return await getProviderCommitData(repo, sha);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to load commit data", error);
    }
    return undefined;
  }
}

async function getLatestCommitHash(
  repoUrl: string,
): Promise<string | undefined> {
  if (!repoUrl) {
    return undefined;
  }

  try {
    const repo = getRepositoryInfo(repoUrl);
    if (!repo) {
      return undefined;
    }

    const commits = await getProviderCommitHistory(repo, 1, 1);
    return commits[0]?.sha || undefined;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to load latest commit hash", error);
    }
    return undefined;
  }
}

async function fetchReadmeContentFromConfigUrl(
  repoUrl: string,
): Promise<string | undefined> {
  if (!repoUrl) {
    return undefined;
  }

  try {
    const repo = getRepositoryInfo(repoUrl);
    if (!repo) {
      return undefined;
    }

    return (await getProviderReadme(repo)) ?? undefined;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to load repository README", error);
    }
    return undefined;
  }
}

export {
  getCommitHistory,
  fetchReadmeContentFromConfigUrl,
  getLatestCommitData,
  getLatestCommitHash,
};
