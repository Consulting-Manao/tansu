import type { FormattedCommit } from "../types/github";

interface GitHistoryCommit {
  sha: string;
  authorName: string;
  authorDate: string;
  message: string;
  commitUrl?: string;
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

function getGitApiUrl(): string {
  const proxyUrl = import.meta.env.PUBLIC_GIT_PROXY_URL;
  if (proxyUrl && typeof proxyUrl === "string" && proxyUrl.trim()) {
    return proxyUrl.trim();
  }

  throw new Error("PUBLIC_GIT_PROXY_URL is not configured");
}

async function callGitApi<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(getGitApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Git API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
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

async function getCommitHistory(
  repoUrl: string,
  page: number = 1,
  perPage: number = 30,
): Promise<{ date: string; commits: FormattedCommit[] }[] | null> {
  if (!repoUrl) {
    return null;
  }

  try {
    const data = await callGitApi<{ commits: GitHistoryCommit[] }>({
      action: "history",
      repoUrl,
      page,
      perPage,
    });

    const formattedCommits = data.commits.map((commit) => ({
      message: commit.message,
      author: {
        name: commit.authorName,
        html_url: "",
      },
      commit_date: commit.authorDate,
      html_url: commit.commitUrl || "",
      sha: commit.sha,
    }));

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
    return await callGitApi<GitCommitDetails>({
      action: "commit",
      repoUrl,
      sha,
    });
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
    const { sha } = await callGitApi<{ sha: string }>({
      action: "latest-hash",
      repoUrl,
    });
    return sha;
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
    const { content } = await callGitApi<{ content?: string | null }>({
      action: "readme",
      repoUrl,
    });
    return content ?? undefined;
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
