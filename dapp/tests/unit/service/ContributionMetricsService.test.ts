import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormattedCommit } from "../../../src/types/github";

// A history page: its days, or a rejection.
const mockHistory = vi.fn();

vi.mock("../../../src/service/RepositoryMetadataService", () => ({
  commitHistoryQuery: (repoUrl: string, page: number, perPage: number) => ({
    queryKey: ["repo", repoUrl, "history", page, perPage],
    queryFn: () => mockHistory(repoUrl, page, perPage),
  }),
}));

import {
  calculateMetrics,
  contributionMetricsQuery,
} from "../../../src/service/ContributionMetricsService";
import { queryClient } from "../../../src/service/queryClient";

const REPO = "https://github.com/example/project";

function commit(author: string, date: string, index = 0): FormattedCommit {
  return {
    sha: `${index}`.padStart(40, "a"),
    author: { name: author, html_url: "" },
    commit_date: date,
    html_url: "",
    message: `Commit ${index}`,
  };
}

/** `count` commits by `author`, one a day in `month` (YYYY-MM). */
function commits(author: string, month: string, count: number) {
  return Array.from({ length: count }, (_, i) =>
    commit(
      author,
      `${month}-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
      i,
    ),
  );
}

const page = (list: FormattedCommit[]) => [{ date: "any", commits: list }];

describe("contributionMetricsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("reads pages until one is not full", async () => {
    mockHistory
      .mockResolvedValueOnce(page(commits("Alice", "2026-01", 30)))
      .mockResolvedValueOnce(page(commits("Bob", "2026-02", 30)))
      .mockResolvedValueOnce(page(commits("Carol", "2026-03", 5)));

    const metrics = await queryClient.query(contributionMetricsQuery(REPO));

    expect(mockHistory.mock.calls).toEqual([
      [REPO, 1, 30],
      [REPO, 2, 30],
      [REPO, 3, 30],
    ]);
    expect(metrics.totalCommits).toBe(65);
    expect(metrics.totalContributors).toBe(3);
  });

  it("has nothing to count for an unknown host or an empty repository", async () => {
    mockHistory.mockResolvedValue(null);
    const metrics = await queryClient.query(contributionMetricsQuery(REPO));
    expect(metrics.totalCommits).toBe(0);
    expect(metrics.ponyFactor.factor).toBe(0);
    expect(mockHistory).toHaveBeenCalledTimes(1);
  });

  it("fails when the history cannot be read", async () => {
    mockHistory.mockRejectedValue(new Error("API rate limit"));
    await expect(
      queryClient.query(contributionMetricsQuery(REPO)),
    ).rejects.toThrow("API rate limit");
  });
});

describe("calculateMetrics", () => {
  it("leaves bots out", () => {
    const metrics = calculateMetrics([
      commit("dependabot[bot]", "2026-04-01T00:00:00Z"),
      commit("Renovate Bot", "2026-04-01T00:00:00Z"),
      commit("github-actions", "2026-04-01T00:00:00Z"),
      commit("snyk-bot", "2026-04-01T00:00:00Z"),
      commit("codecov", "2026-04-01T00:00:00Z"),
      commit("Bobby Tables", "2026-04-01T00:00:00Z"),
    ]);
    expect(metrics.contributorActivity.map((c) => c.author.name)).toEqual([
      "Bobby Tables",
    ]);
  });

  it("finds the fewest contributors behind half of the commits", () => {
    const dominated = calculateMetrics([
      ...commits("Alice", "2026-04", 3),
      ...commits("Bob", "2026-04", 1),
    ]);
    expect(dominated.ponyFactor).toMatchObject({
      factor: 1,
      totalContributors: 2,
      explanation: "1 contributor responsible for 75.0% of commits",
    });

    const even = calculateMetrics([
      ...commits("Alice", "2026-04", 1),
      ...commits("Bob", "2026-04", 1),
      ...commits("Carol", "2026-04", 1),
    ]);
    expect(even.ponyFactor.factor).toBe(2);
  });

  it("counts commits and contributors per month, busiest first", () => {
    const metrics = calculateMetrics([
      ...commits("Bob", "2026-02", 1),
      ...commits("Alice", "2026-01", 2),
      commit("Alice", "2026-02-10T00:00:00Z"),
    ]);
    expect(metrics.monthlyStats).toMatchObject({
      "2026-01": { commits: 2, contributors: 1 },
      "2026-02": { commits: 2, contributors: 2 },
    });
    expect(metrics.contributorActivity[0]).toMatchObject({
      author: { name: "Alice" },
      commitCount: 3,
      firstCommit: "2026-01-01T10:00:00Z",
      lastCommit: "2026-02-10T00:00:00Z",
    });
  });

  it("spans the days between the first and last commits", () => {
    const metrics = calculateMetrics([
      commit("Alice", "2026-01-31T00:00:00Z"),
      commit("Bob", "2026-01-01T00:00:00Z"),
    ]);
    expect(metrics.repositoryTimespan).toEqual({
      firstCommit: "2026-01-01T00:00:00.000Z",
      lastCommit: "2026-01-31T00:00:00.000Z",
      totalDays: 30,
    });
    expect(
      calculateMetrics([commit("Alice", "2026-04-15T00:00:00Z")])
        .repositoryTimespan.totalDays,
    ).toBe(0);
  });
});
