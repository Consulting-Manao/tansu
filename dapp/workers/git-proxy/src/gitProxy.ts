export interface Env {
  CORS_ALLOWED_ORIGINS?: string;
  GITHUB_TOKEN?: string;
  GITLAB_TOKEN?: string;
  BITBUCKET_USERNAME?: string;
  BITBUCKET_APP_PASSWORD?: string;
  CODEBERG_TOKEN?: string;
  GITEA_TOKEN?: string;
}

export interface GitHistoryCommit {
  sha: string;
  authorName: string;
  authorDate: string;
  authorEmail?: string;
  committerName?: string;
  committerDate?: string;
  committerEmail?: string;
  message: string;
  commitUrl?: string;
}

export interface GitCommitDetails {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
    author: { name: string; email?: string; date: string };
    committer: { name: string; email?: string; date: string };
  };
}

export interface ParsedRepoUrl {
  provider: "github" | "gitlab" | "bitbucket" | "gitea";
  host: string;
  owner: string;
  repo: string;
  projectPath: string;
  normalizedUrl: string;
}

type RequestAction = "history" | "commit" | "latest-hash" | "readme";

const README_CANDIDATES = [
  "README.md",
  "README.MD",
  "README",
  "Readme.md",
  "readme.md",
];

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4321",
  "https://testnet.tansu.dev",
  "https://app.tansu.dev",
  "https://tansu.xlm.sh",
  "https://deploy-preview-*--staging-tansu.netlify.app",
];

export function getCorsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (!origin) {
    return {};
  }

  const configuredOrigins = (env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const allowedOrigins = configuredOrigins.length > 0
    ? configuredOrigins
    : DEFAULT_ALLOWED_ORIGINS;

  const isAllowed = allowedOrigins.some((allowed) => originMatches(origin, allowed));
  if (!isAllowed) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function originMatches(origin: string, allowed: string): boolean {
  if (!allowed.includes("*")) {
    return origin === allowed;
  }

  const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escaped.replace(/\*/g, ".*")}$`;
  return new RegExp(pattern).test(origin);
}

export function parseRepoUrl(repoUrl: string): ParsedRepoUrl {
  const trimmed = repoUrl.trim();
  if (!trimmed) {
    throw new Error("Repository URL is required");
  }

  if (trimmed.startsWith("git@")) {
    const match = trimmed.match(/^git@([^:]+):(.+)$/);
    if (!match?.[1] || !match[2]) {
      throw new Error("Invalid repository URL format");
    }

    const host = match[1].toLowerCase();
    return parseHostPath(host, match[2]);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid repository URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS repository URLs are supported");
  }

  return parseHostPath(parsed.hostname.toLowerCase(), parsed.pathname);
}

function parseHostPath(host: string, pathname: string): ParsedRepoUrl {
  const segments = pathname
    .replace(/^\//, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2) {
    throw new Error("Repository URL must include owner and repository");
  }

  if (host === "github.com") {
    return buildParsedRepo("github", host, segments[0] || "", segments[1] || "", [segments[0] || "", segments[1] || ""]);
  }

  if (host === "gitlab.com") {
    const repo = segments[segments.length - 1] || "";
    const owner = segments[segments.length - 2] || "";
    return buildParsedRepo("gitlab", host, owner, repo, segments);
  }

  if (host === "bitbucket.org") {
    return buildParsedRepo("bitbucket", host, segments[0] || "", segments[1] || "", [segments[0] || "", segments[1] || ""]);
  }

  if (host === "codeberg.org" || host === "gitea.com") {
    return buildParsedRepo("gitea", host, segments[0] || "", segments[1] || "", [segments[0] || "", segments[1] || ""]);
  }

  throw new Error(`Unsupported repository host: ${host}`);
}

function buildParsedRepo(
  provider: ParsedRepoUrl["provider"],
  host: string,
  owner: string,
  repo: string,
  segments: string[],
): ParsedRepoUrl {
  const projectPath = segments.join("/");
  return {
    provider,
    host,
    owner,
    repo,
    projectPath,
    normalizedUrl: `https://${host}/${projectPath}`,
  };
}

export async function handleApiRequest(
  body: Record<string, unknown>,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const action = body.action;
  const repoUrl = body.repoUrl;
  const page = Number(body.page || 1);
  const perPage = Number(body.perPage || 30);
  const sha = body.sha;

  if (typeof action !== "string") {
    return jsonResponse({ error: "Action is required" }, 400);
  }

  if (!repoUrl || typeof repoUrl !== "string") {
    return jsonResponse({ error: "Repository URL is required" }, 400);
  }

  let repo: ParsedRepoUrl;
  try {
    repo = parseRepoUrl(repoUrl);
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 400);
  }

  try {
    switch (action as RequestAction) {
      case "history": {
        const commits = await getCommitHistory(repo, page, perPage, env, fetchImpl);
        return jsonResponse({ commits }, 200);
      }

      case "commit": {
        if (!sha || typeof sha !== "string") {
          return jsonResponse({ error: "Commit SHA is required" }, 400);
        }

        const commit = await getCommitDetails(repo, sha, env, fetchImpl);
        if (!commit) {
          return new Response(null, { status: 404 });
        }

        return jsonResponse(commit, 200);
      }

      case "latest-hash": {
        const latestSha = await getLatestCommitHash(repo, env, fetchImpl);
        return jsonResponse({ sha: latestSha }, 200);
      }

      case "readme": {
        const content = await getReadmeContent(repo, env, fetchImpl);
        return jsonResponse({ content }, 200);
      }

      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    console.error("Git proxy error", error);
    return jsonResponse({ error: getErrorMessage(error) || "Failed to process git request" }, 500);
  }
}

async function getCommitHistory(
  repo: ParsedRepoUrl,
  page: number,
  perPage: number,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitHistoryCommit[]> {
  switch (repo.provider) {
    case "github":
      return getGithubHistory(repo, page, perPage, env, fetchImpl);
    case "gitlab":
      return getGitlabHistory(repo, page, perPage, env, fetchImpl);
    case "bitbucket":
      return getBitbucketHistory(repo, page, perPage, env, fetchImpl);
    case "gitea":
      return getGiteaHistory(repo, page, perPage, env, fetchImpl);
  }
}

async function getCommitDetails(
  repo: ParsedRepoUrl,
  sha: string,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitCommitDetails | undefined> {
  switch (repo.provider) {
    case "github":
      return getGithubCommit(repo, sha, env, fetchImpl);
    case "gitlab":
      return getGitlabCommit(repo, sha, env, fetchImpl);
    case "bitbucket":
      return getBitbucketCommit(repo, sha, env, fetchImpl);
    case "gitea":
      return getGiteaCommit(repo, sha, env, fetchImpl);
  }
}

async function getLatestCommitHash(
  repo: ParsedRepoUrl,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<string> {
  const commits = await getCommitHistory(repo, 1, 1, env, fetchImpl);
  return commits[0]?.sha || "";
}

async function getReadmeContent(
  repo: ParsedRepoUrl,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  switch (repo.provider) {
    case "github":
      return getGithubReadme(repo, env, fetchImpl);
    case "gitlab":
      return getGitlabReadme(repo, env, fetchImpl);
    case "bitbucket":
      return getBitbucketReadme(repo, env, fetchImpl);
    case "gitea":
      return getGiteaReadme(repo, env, fetchImpl);
  }
}

function getProviderHeaders(repo: ParsedRepoUrl, env: Env): HeadersInit {
  switch (repo.provider) {
    case "github":
      return env.GITHUB_TOKEN
        ? {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          }
        : { Accept: "application/vnd.github+json" };
    case "gitlab":
      return env.GITLAB_TOKEN ? { "PRIVATE-TOKEN": env.GITLAB_TOKEN } : {};
    case "bitbucket": {
      if (env.BITBUCKET_USERNAME && env.BITBUCKET_APP_PASSWORD) {
        const credentials = btoa(`${env.BITBUCKET_USERNAME}:${env.BITBUCKET_APP_PASSWORD}`);
        return { Authorization: `Basic ${credentials}` };
      }
      return {};
    }
    case "gitea": {
      const token = repo.host === "codeberg.org" ? env.CODEBERG_TOKEN : env.GITEA_TOKEN;
      return token ? { Authorization: `token ${token}` } : {};
    }
  }
}

async function getGithubHistory(
  repo: ParsedRepoUrl,
  page: number,
  perPage: number,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitHistoryCommit[]> {
  const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.repo}/commits`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  const payload = await fetchJson<any[]>(url.toString(), {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);

  return payload.map((entry) => ({
    sha: entry.sha,
    authorName: entry.commit?.author?.name || "",
    authorDate: entry.commit?.author?.date || "",
    authorEmail: entry.commit?.author?.email || "",
    committerName: entry.commit?.committer?.name || "",
    committerDate: entry.commit?.committer?.date || "",
    committerEmail: entry.commit?.committer?.email || "",
    message: entry.commit?.message || "",
    commitUrl: entry.html_url || `${repo.normalizedUrl}/commit/${entry.sha}`,
  }));
}

async function getGithubCommit(
  repo: ParsedRepoUrl,
  sha: string,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitCommitDetails | undefined> {
  const payload = await fetchMaybeJson<any>(`https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${sha}`, {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);
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
  repo: ParsedRepoUrl,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo.owner}/${repo.repo}/readme`, {
    headers: {
      ...getProviderHeaders(repo, env),
      Accept: "application/vnd.github.raw+json",
    },
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}`);
  }
  return response.text();
}

async function getGitlabHistory(
  repo: ParsedRepoUrl,
  page: number,
  perPage: number,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitHistoryCommit[]> {
  const project = encodeURIComponent(repo.projectPath);
  const url = new URL(`https://gitlab.com/api/v4/projects/${project}/repository/commits`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  const payload = await fetchJson<any[]>(url.toString(), {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);

  return payload.map((entry) => ({
    sha: entry.id,
    authorName: entry.author_name || "",
    authorDate: entry.authored_date || entry.created_at || "",
    authorEmail: entry.author_email || "",
    committerName: entry.committer_name || entry.author_name || "",
    committerDate: entry.committed_date || entry.authored_date || "",
    committerEmail: entry.committer_email || "",
    message: entry.message || entry.title || "",
    commitUrl: entry.web_url || `${repo.normalizedUrl}/-/commit/${entry.id}`,
  }));
}

async function getGitlabCommit(
  repo: ParsedRepoUrl,
  sha: string,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitCommitDetails | undefined> {
  const project = encodeURIComponent(repo.projectPath);
  const payload = await fetchMaybeJson<any>(`https://gitlab.com/api/v4/projects/${project}/repository/commits/${encodeURIComponent(sha)}`, {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);
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
  repo: ParsedRepoUrl,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  const project = encodeURIComponent(repo.projectPath);
  for (const candidate of README_CANDIDATES) {
    const response = await fetchImpl(
      `https://gitlab.com/api/v4/projects/${project}/repository/files/${encodeURIComponent(candidate)}/raw?ref=HEAD`,
      { headers: getProviderHeaders(repo, env) },
    );
    if (response.status === 404) {
      continue;
    }
    if (!response.ok) {
      throw new Error(`GitLab API request failed with status ${response.status}`);
    }
    return response.text();
  }
  return undefined;
}

async function getBitbucketHistory(
  repo: ParsedRepoUrl,
  page: number,
  perPage: number,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitHistoryCommit[]> {
  const url = new URL(`https://api.bitbucket.org/2.0/repositories/${repo.owner}/${repo.repo}/commits`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pagelen", String(perPage));
  const payload = await fetchJson<{ values: any[] }>(url.toString(), {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);

  return payload.values.map((entry) => ({
    sha: entry.hash,
    authorName: entry.author?.user?.display_name || entry.author?.raw || "",
    authorDate: entry.date || "",
    committerName: entry.author?.user?.display_name || entry.author?.raw || "",
    committerDate: entry.date || "",
    message: entry.message || "",
    commitUrl: entry.links?.html?.href || `${repo.normalizedUrl}/commits/${entry.hash}`,
  }));
}

async function getBitbucketCommit(
  repo: ParsedRepoUrl,
  sha: string,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitCommitDetails | undefined> {
  const payload = await fetchMaybeJson<any>(`https://api.bitbucket.org/2.0/repositories/${repo.owner}/${repo.repo}/commit/${encodeURIComponent(sha)}`, {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);
  if (!payload) {
    return undefined;
  }

  const authorName = payload.author?.user?.display_name || payload.author?.raw || "";
  return {
    sha: payload.hash,
    html_url: payload.links?.html?.href || `${repo.normalizedUrl}/commits/${payload.hash}`,
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
  repo: ParsedRepoUrl,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  for (const candidate of README_CANDIDATES) {
    const response = await fetchImpl(
      `https://api.bitbucket.org/2.0/repositories/${repo.owner}/${repo.repo}/src/HEAD/${candidate}`,
      { headers: getProviderHeaders(repo, env) },
    );
    if (response.status === 404) {
      continue;
    }
    if (!response.ok) {
      throw new Error(`Bitbucket API request failed with status ${response.status}`);
    }
    return response.text();
  }
  return undefined;
}

async function getGiteaHistory(
  repo: ParsedRepoUrl,
  page: number,
  perPage: number,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitHistoryCommit[]> {
  const url = new URL(`https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}/commits`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(perPage));
  const payload = await fetchJson<any[]>(url.toString(), {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);

  return payload.map((entry) => ({
    sha: entry.sha,
    authorName: entry.commit?.author?.name || entry.author?.login || "",
    authorDate: entry.commit?.author?.date || "",
    authorEmail: entry.commit?.author?.email || "",
    committerName: entry.commit?.committer?.name || "",
    committerDate: entry.commit?.committer?.date || "",
    committerEmail: entry.commit?.committer?.email || "",
    message: entry.commit?.message || "",
    commitUrl: entry.html_url || `${repo.normalizedUrl}/commit/${entry.sha}`,
  }));
}

async function getGiteaCommit(
  repo: ParsedRepoUrl,
  sha: string,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<GitCommitDetails | undefined> {
  const payload = await fetchMaybeJson<any>(`https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(sha)}`, {
    headers: getProviderHeaders(repo, env),
  }, fetchImpl);
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
  repo: ParsedRepoUrl,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  for (const candidate of README_CANDIDATES) {
    const payload = await fetchMaybeJson<any>(`https://${repo.host}/api/v1/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(candidate)}?ref=HEAD`, {
      headers: getProviderHeaders(repo, env),
    }, fetchImpl);
    if (!payload) {
      continue;
    }
    if (typeof payload.content === "string") {
      return decodeBase64Utf8(payload.content);
    }
  }
  return undefined;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} API request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchMaybeJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T | undefined> {
  const response = await fetchImpl(url, init);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} API request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}