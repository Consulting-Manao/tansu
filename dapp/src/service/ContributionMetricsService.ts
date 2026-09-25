/**
 * Contribution metrics of a repository, computed from its commit history. The
 * pages are `commitHistoryQuery` pages, so the history list shares them.
 */
import { queryOptions } from "@tanstack/react-query";
import type {
  ContributionMetrics,
  ContributorActivity,
  PonyFactorResult,
} from "../types/contributionMetrics";
import type { FormattedCommit } from "../types/github";
import { commitHistoryQuery } from "./RepositoryMetadataService";
import { queryClient } from "./queryClient";

const PER_PAGE = 100;
// A few requests, not a host's hourly quota (GitHub: 60 without a token).
const MAX_PAGES = 10;

const BOT_PATTERNS = [
  /dependabot/i,
  /renovate/i,
  /bot$/i,
  /\[bot\]/i,
  /greenkeeper/i,
  /snyk-bot/i,
  /github-actions/i,
  /codecov/i,
];

/**
 * Metrics over the repository's latest commits, up to 1000; `complete` when
 * they are all of them.
 */
export const contributionMetricsQuery = (repoUrl: string) =>
  queryOptions({
    queryKey: ["repo", repoUrl, "metrics"],
    queryFn: async () => {
      const { commits, complete } = await readCommits(repoUrl);
      return { ...calculateMetrics(commits), complete };
    },
    staleTime: 60 * 60_000,
    // Its pages retry on their own.
    retry: false,
  });

async function readCommits(
  repoUrl: string,
): Promise<{ commits: FormattedCommit[]; complete: boolean }> {
  const commits: FormattedCommit[] = [];
  // A host may serve fewer per page than asked (Gitea: 50): a page shorter
  // than the first is the last.
  let pageSize = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const days = await queryClient.query(
      commitHistoryQuery(repoUrl, page, PER_PAGE),
    );
    const pageCommits = (days ?? []).flatMap((day) => day.commits);
    commits.push(...pageCommits);
    pageSize ||= pageCommits.length;
    if (!pageCommits.length || pageCommits.length < pageSize) {
      return { commits, complete: true };
    }
  }
  return { commits, complete: false };
}

const isBot = (name: string) =>
  BOT_PATTERNS.some((pattern) => pattern.test(name));

const monthOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function calculateMetrics(
  commits: FormattedCommit[],
): ContributionMetrics {
  const contributors = new Map<string, ContributorActivity>();
  const monthlyStats: ContributionMetrics["monthlyStats"] = {};

  for (const commit of commits) {
    const { name } = commit.author;
    if (isBot(name)) continue;

    const date = commit.commit_date;
    const month = monthOf(new Date(date));

    let contributor = contributors.get(name);
    if (!contributor) {
      contributor = {
        author: { name },
        commitCount: 0,
        linesAdded: 0,
        linesRemoved: 0,
        firstCommit: date,
        lastCommit: date,
        monthlyActivity: [],
      };
      contributors.set(name, contributor);
    }
    contributor.commitCount++;
    if (new Date(date) > new Date(contributor.lastCommit)) {
      contributor.lastCommit = date;
    }
    if (new Date(date) < new Date(contributor.firstCommit)) {
      contributor.firstCommit = date;
    }

    monthlyStats[month] ??= { commits: 0, contributors: 0, linesChanged: 0 };
    monthlyStats[month].commits++;

    const activity = contributor.monthlyActivity.find((m) => m.month === month);
    if (activity) {
      activity.commitCount++;
    } else {
      contributor.monthlyActivity.push({
        month,
        commitCount: 1,
        linesAdded: 0,
        linesRemoved: 0,
      });
    }
  }

  const contributorActivity = [...contributors.values()].sort(
    (a, b) => b.commitCount - a.commitCount,
  );
  for (const [month, stats] of Object.entries(monthlyStats)) {
    stats.contributors = contributorActivity.filter((c) =>
      c.monthlyActivity.some((m) => m.month === month),
    ).length;
  }

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const dates = commits
    .map((commit) => new Date(commit.commit_date))
    .sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0];
  const last = dates[dates.length - 1];

  return {
    ponyFactor: ponyFactor(contributorActivity),
    totalCommits: commits.length,
    totalContributors: contributorActivity.length,
    activeContributors: contributorActivity.filter(
      (c) => new Date(c.lastCommit) >= threeMonthsAgo,
    ).length,
    contributorActivity,
    monthlyStats,
    repositoryTimespan: {
      firstCommit: first?.toISOString() ?? "",
      lastCommit: last?.toISOString() ?? "",
      totalDays:
        first && last
          ? Math.ceil((last.getTime() - first.getTime()) / 86_400_000)
          : 0,
    },
  };
}

/** The fewest contributors behind half of the commits. */
function ponyFactor(contributors: ContributorActivity[]): PonyFactorResult {
  const totalCommits = contributors.reduce((sum, c) => sum + c.commitCount, 0);

  let cumulativeCommits = 0;
  const topContributors: ContributorActivity[] = [];
  for (const contributor of contributors) {
    cumulativeCommits += contributor.commitCount;
    topContributors.push(contributor);
    if (cumulativeCommits >= totalCommits * 0.5) break;
  }

  const factor = topContributors.length;
  const percentage =
    totalCommits > 0
      ? ((cumulativeCommits / totalCommits) * 100).toFixed(1)
      : "0";
  return {
    factor,
    topContributors,
    totalContributors: contributors.length,
    explanation: `${factor} contributor${factor !== 1 ? "s" : ""} responsible for ${percentage}% of commits`,
  };
}
