import { describe, it, expect, vi, beforeEach } from "vitest";

function sha(n: number): string {
  return "a" + "0".repeat(36) + String(n).padStart(3, "0");
}

const mockGetCommitHistory = vi.fn();

vi.mock("../../../src/service/RepositoryMetadataService", () => ({
  getCommitHistory: (...args: unknown[]) => mockGetCommitHistory(...args),
}));

import { ContributionMetricsService } from "../../../src/service/ContributionMetricsService";

function makeCommit(
  idx: number,
  author: string,
  date: string,
  message: string,
) {
  return {
    sha: sha(idx),
    author: { name: author, html_url: "" },
    commit_date: date,
    html_url: "",
    message,
  };
}

describe("ContributionMetricsService.fetchMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single page and returns metrics", async () => {
    mockGetCommitHistory.mockResolvedValue([
      {
        date: "2026-01-15",
        commits: [
          makeCommit(1, "Alice", "2026-01-15T10:00:00Z", "First commit"),
          makeCommit(2, "Alice", "2026-01-15T11:00:00Z", "Second commit"),
        ],
      },
    ]);

    const metrics = await ContributionMetricsService.fetchMetrics(
      "https://github.com/example/project",
    );

    expect(metrics.totalCommits).toBe(2);
    expect(metrics.totalContributors).toBe(1);
    expect(metrics.ponyFactor.factor).toBe(1);
    expect(mockGetCommitHistory).toHaveBeenCalledTimes(1);
    expect(mockGetCommitHistory).toHaveBeenCalledWith(
      "https://github.com/example/project",
      1,
      30,
    );
  });

  it("paginates until a page has fewer than the requested count", async () => {
    const page1 = Array.from({ length: 30 }, (_, i) =>
      makeCommit(
        i,
        "Alice",
        `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        `Commit ${i + 1}`,
      ),
    );
    const page2 = Array.from({ length: 30 }, (_, i) =>
      makeCommit(
        100 + i,
        "Bob",
        `2026-02-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        `Commit ${i + 31}`,
      ),
    );
    const page3 = Array.from({ length: 5 }, (_, i) =>
      makeCommit(
        200 + i,
        "Carol",
        `2026-03-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        `Commit ${i + 61}`,
      ),
    );

    mockGetCommitHistory
      .mockResolvedValueOnce([{ date: "2026-01-01", commits: page1 }])
      .mockResolvedValueOnce([{ date: "2026-02-01", commits: page2 }])
      .mockResolvedValueOnce([{ date: "2026-03-01", commits: page3 }]);

    const metrics = await ContributionMetricsService.fetchMetrics(
      "https://github.com/example/project",
    );

    expect(mockGetCommitHistory).toHaveBeenCalledTimes(3);
    expect(metrics.totalCommits).toBe(65);
    expect(metrics.totalContributors).toBe(3);
  });

  it("returns empty metrics for empty repository", async () => {
    mockGetCommitHistory.mockResolvedValue([]);
    const metrics = await ContributionMetricsService.fetchMetrics(
      "https://github.com/empty/project",
    );
    expect(metrics.totalCommits).toBe(0);
    expect(metrics.totalContributors).toBe(0);
  });

  it("stops pagination when getCommitHistory returns null", async () => {
    mockGetCommitHistory.mockResolvedValue(null);
    const metrics = await ContributionMetricsService.fetchMetrics(
      "https://github.com/empty/project",
    );
    expect(metrics.totalCommits).toBe(0);
    expect(mockGetCommitHistory).toHaveBeenCalledTimes(1);
  });

  it("re-throws outer error for empty repoUrl", async () => {
    await expect(ContributionMetricsService.fetchMetrics("")).rejects.toThrow(
      "Failed to load contribution metrics",
    );
    expect(mockGetCommitHistory).not.toHaveBeenCalled();
  });

  it("throws when getCommitHistory throws", async () => {
    mockGetCommitHistory.mockRejectedValue(new Error("API rate limit"));
    await expect(
      ContributionMetricsService.fetchMetrics(
        "https://github.com/example/project",
      ),
    ).rejects.toThrow("Failed to load contribution metrics");
  });

  it("computes pony factor correctly across pages", async () => {
    const aliceCommits = Array.from({ length: 40 }, (_, i) =>
      makeCommit(
        i,
        "Alice",
        `2026-01-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
        `Alice commit ${i + 1}`,
      ),
    );
    const bobCommits = Array.from({ length: 10 }, (_, i) =>
      makeCommit(
        100 + i,
        "Bob",
        `2026-02-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
        `Bob commit ${i + 1}`,
      ),
    );
    const carolCommits = Array.from({ length: 5 }, (_, i) =>
      makeCommit(
        200 + i,
        "Carol",
        `2026-03-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
        `Carol commit ${i + 1}`,
      ),
    );

    mockGetCommitHistory
      .mockResolvedValueOnce([
        { date: "2026-01-01", commits: aliceCommits.slice(0, 30) },
      ])
      .mockResolvedValueOnce([
        {
          date: "2026-02-01",
          commits: [...aliceCommits.slice(30), ...bobCommits, ...carolCommits],
        },
      ]);

    const metrics = await ContributionMetricsService.fetchMetrics(
      "https://github.com/example/project",
    );
    expect(metrics.totalCommits).toBe(55);
    expect(metrics.totalContributors).toBe(3);
    expect(metrics.ponyFactor.factor).toBe(1);
  });
});
