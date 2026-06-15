import { describe, it, expect } from "vitest";
import { GitLogService } from "../../../src/service/GitLogService";

function buildCommitBlock(
  sha: string,
  authorName: string,
  authorEmail: string,
  authorDate: string,
  message: string,
): string {
  return [
    `commit ${sha}`,
    `Author: ${authorName} <${authorEmail}>`,
    `AuthorDate: ${authorDate}`,
    `Commit: ${authorName} <${authorEmail}>`,
    `CommitDate: ${authorDate}`,
    "",
    message
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n"),
    "",
  ].join("\n");
}

function makeGitLog(
  ...commits: {
    sha?: string;
    authorName?: string;
    authorEmail?: string;
    date?: string;
    message?: string;
  }[]
): string {
  return commits
    .map((c, i) =>
      buildCommitBlock(
        c.sha ?? `a${String(i).padStart(39, "0")}`,
        c.authorName ?? "Alice",
        c.authorEmail ?? "alice@example.com",
        c.date ?? "2026-04-15T10:00:00Z",
        c.message ?? "Initial commit",
      ),
    )
    .join("\n");
}

const VALID_SHA = "a000000000000000000000000000000000000001";

describe("GitLogService.parseGitLog", () => {
  it("parses a single commit block", () => {
    const log = makeGitLog({ sha: VALID_SHA });
    const commits = GitLogService.parseGitLog(log);
    expect(commits).toHaveLength(1);
    expect(commits[0]!.sha).toBe(VALID_SHA);
    expect(commits[0]!.author.name).toBe("Alice");
    expect(commits[0]!.author.email).toBe("alice@example.com");
    expect(commits[0]!.message).toBe("Initial commit");
  });

  it("parses multiple commits in reverse chronological order", () => {
    const log = makeGitLog(
      { sha: "b000000000000000000000000000000000000002", authorName: "Bob" },
      { sha: "a000000000000000000000000000000000000001", authorName: "Alice" },
    );
    const commits = GitLogService.parseGitLog(log);
    expect(commits).toHaveLength(2);
    expect(commits[0]!.sha).toBe("b000000000000000000000000000000000000002");
    expect(commits[1]!.sha).toBe("a000000000000000000000000000000000000001");
  });

  it("parses multiline commit messages", () => {
    const message = "feat: add feature\n\nThis is a long\ndescription.";
    const log = makeGitLog({ sha: VALID_SHA, message });
    const commits = GitLogService.parseGitLog(log);
    expect(commits).toHaveLength(1);
    expect(commits[0]!.message).toBe(
      "feat: add feature\n\nThis is a long\ndescription.",
    );
  });

  it("returns empty array for empty input", () => {
    expect(GitLogService.parseGitLog("")).toEqual([]);
  });

  it("returns empty array for malformed input", () => {
    expect(GitLogService.parseGitLog("not a git log at all")).toEqual([]);
  });

  it("skips blocks missing a valid commit SHA header", () => {
    const badBlock = "not a commit\nAuthor: Alice <alice@example.com>\n";
    const goodBlock = buildCommitBlock(
      VALID_SHA,
      "Alice",
      "alice@example.com",
      "2026-04-15T10:00:00Z",
      "Good commit",
    );
    const log = [badBlock, goodBlock].join("\n\n");
    const commits = GitLogService.parseGitLog(log);
    expect(commits).toHaveLength(1);
    expect(commits[0]!.sha).toBe(VALID_SHA);
  });

  it("handles commit messages with empty lines and indentation", () => {
    const message = "Line1\n\nLine3\n\n\nLine6";
    const log = makeGitLog({ sha: VALID_SHA, message });
    const commits = GitLogService.parseGitLog(log);
    expect(commits).toHaveLength(1);
    expect(commits[0]!.message).toBe("Line1\n\nLine3\n\n\nLine6");
  });
});

describe("GitLogService — bot detection", () => {
  it("skips dependabot commits when calculating metrics", () => {
    const log = makeGitLog(
      { authorName: "dependabot[bot]", authorEmail: "dependabot@github.com" },
      { authorName: "Alice", authorEmail: "alice@example.com" },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.totalCommits).toBe(2);
    expect(metrics.totalContributors).toBe(1);
    expect(metrics.contributorActivity[0]!.author.name).toBe("Alice");
  });

  it("skips commits from known bot patterns in name or email", () => {
    const log = makeGitLog(
      {
        authorName: "Renovate Bot",
        authorEmail: "renovate@whitesourcesoftware.com",
      },
      { authorName: "github-actions", authorEmail: "actions@github.com" },
      { authorName: "snyk-bot", authorEmail: "snyk-bot@snyk.io" },
      { authorName: "codecov", authorEmail: "codecov@codecov.io" },
      { authorName: "Alice", authorEmail: "alice@example.com" },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.totalContributors).toBe(1);
    expect(metrics.contributorActivity[0]!.author.name).toBe("Alice");
  });

  it("includes a developer named 'bot' in a different context", () => {
    const log = makeGitLog({
      authorName: "Bobby Tables",
      authorEmail: "bobby@botany.example",
    });
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.totalContributors).toBe(1);
  });
});

describe("GitLogService.calculateMetrics", () => {
  it("computes correct pony factor when one contributor dominates", () => {
    const log = makeGitLog(
      {
        sha: "a000000000000000000000000000000000000001",
        authorName: "Alice",
        date: "2026-04-01T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000002",
        authorName: "Alice",
        date: "2026-04-02T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000003",
        authorName: "Alice",
        date: "2026-04-03T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000004",
        authorName: "Bob",
        date: "2026-04-04T00:00:00Z",
      },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.ponyFactor.factor).toBe(1);
    expect(metrics.ponyFactor.explanation).toContain("1 contributor");
    expect(metrics.ponyFactor.totalContributors).toBe(2);
  });

  it("computes pony factor of 2 when three contributors are evenly split", () => {
    const log = makeGitLog(
      {
        sha: "a000000000000000000000000000000000000001",
        authorName: "Alice",
        date: "2026-04-01T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000002",
        authorName: "Bob",
        date: "2026-04-02T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000003",
        authorName: "Carol",
        date: "2026-04-03T00:00:00Z",
      },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.ponyFactor.factor).toBe(2);
    expect(metrics.ponyFactor.explanation).toContain("2 contributors");
  });

  it("groups commits by month correctly", () => {
    const log = makeGitLog(
      {
        sha: "a000000000000000000000000000000000000001",
        authorName: "Alice",
        date: "2026-01-15T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000002",
        authorName: "Alice",
        date: "2026-01-20T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000003",
        authorName: "Alice",
        date: "2026-02-10T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000004",
        authorName: "Bob",
        date: "2026-02-15T00:00:00Z",
      },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.monthlyStats["2026-01"]?.commits).toBe(2);
    expect(metrics.monthlyStats["2026-01"]?.contributors).toBe(1);
    expect(metrics.monthlyStats["2026-02"]?.commits).toBe(2);
    expect(metrics.monthlyStats["2026-02"]?.contributors).toBe(2);
  });

  it("computes repository timespan correctly", () => {
    const log = makeGitLog(
      {
        sha: "a000000000000000000000000000000000000001",
        authorName: "Alice",
        date: "2026-01-01T00:00:00Z",
      },
      {
        sha: "a000000000000000000000000000000000000002",
        authorName: "Bob",
        date: "2026-01-31T00:00:00Z",
      },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.repositoryTimespan.totalDays).toBe(30);
    expect(metrics.repositoryTimespan.firstCommit).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(metrics.repositoryTimespan.lastCommit).toBe(
      "2026-01-31T00:00:00.000Z",
    );
  });

  it("returns zero days for a single commit", () => {
    const log = makeGitLog({
      sha: VALID_SHA,
      authorName: "Alice",
      date: "2026-04-15T00:00:00Z",
    });
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.repositoryTimespan.totalDays).toBe(0);
  });
});

describe("GitLogService.parseCommitMetadata", () => {
  it("extracts Co-authored-by trailers", () => {
    const message = [
      "feat: implement feature",
      "",
      "Co-authored-by: Bob <bob@example.com>",
      "Co-authored-by: Carol <carol@example.com>",
    ].join("\n");
    const log = makeGitLog({ sha: VALID_SHA, message });
    const commits = GitLogService.parseGitLog(log);
    expect(commits[0]!.metadata.coAuthoredBy).toHaveLength(2);
    expect(commits[0]!.metadata.coAuthoredBy[0]!.name).toBe("Bob");
    expect(commits[0]!.metadata.coAuthoredBy[1]!.name).toBe("Carol");
  });

  it("extracts Reviewed-by trailers", () => {
    const message = [
      "refactor: clean up",
      "",
      "Reviewed-by: Dave <dave@example.com>",
    ].join("\n");
    const log = makeGitLog({ sha: VALID_SHA, message });
    const commits = GitLogService.parseGitLog(log);
    expect(commits[0]!.metadata.reviewedBy).toHaveLength(1);
    expect(commits[0]!.metadata.reviewedBy[0]!.name).toBe("Dave");
  });

  it("handles empty commit messages with no metadata", () => {
    const log = makeGitLog({ sha: VALID_SHA, message: "" });
    const commits = GitLogService.parseGitLog(log);
    expect(commits[0]!.metadata.coAuthoredBy).toEqual([]);
    expect(commits[0]!.metadata.reviewedBy).toEqual([]);
  });
});

describe("GitLogService.parseAndAnalyze", () => {
  it("returns both commits and metrics from a git log string", () => {
    const log = makeGitLog(
      { sha: "a000000000000000000000000000000000000001", authorName: "Alice" },
      { sha: "a000000000000000000000000000000000000002", authorName: "Bob" },
    );
    const result = GitLogService.parseAndAnalyze(log);
    expect(result.commits).toHaveLength(2);
    expect(result.metrics.totalCommits).toBe(2);
    expect(result.metrics.totalContributors).toBe(2);
  });
});

describe("GitLogService — contributor ordering", () => {
  it("sorts contributors by commit count descending", () => {
    const log = makeGitLog(
      { authorName: "Alice", date: "2026-04-01T00:00:00Z" },
      { authorName: "Alice", date: "2026-04-02T00:00:00Z" },
      { authorName: "Alice", date: "2026-04-03T00:00:00Z" },
      { authorName: "Bob", date: "2026-04-04T00:00:00Z" },
      { authorName: "Bob", date: "2026-04-05T00:00:00Z" },
      { authorName: "Carol", date: "2026-04-06T00:00:00Z" },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    expect(metrics.contributorActivity[0]!.author.name).toBe("Alice");
    expect(metrics.contributorActivity[0]!.commitCount).toBe(3);
    expect(metrics.contributorActivity[1]!.author.name).toBe("Bob");
    expect(metrics.contributorActivity[1]!.commitCount).toBe(2);
    expect(metrics.contributorActivity[2]!.author.name).toBe("Carol");
    expect(metrics.contributorActivity[2]!.commitCount).toBe(1);
  });

  it("tracks first and last commit dates per contributor", () => {
    const log = makeGitLog(
      { authorName: "Alice", date: "2026-01-01T00:00:00Z" },
      { authorName: "Alice", date: "2026-06-15T00:00:00Z" },
    );
    const { metrics } = GitLogService.parseAndAnalyze(log);
    const alice = metrics.contributorActivity[0]!;
    expect(alice.firstCommit).toBe("2026-01-01T00:00:00Z");
    expect(alice.lastCommit).toBe("2026-06-15T00:00:00Z");
  });

  it("returns empty metrics for empty commits array", () => {
    const result = GitLogService.parseAndAnalyze("");
    expect(result.metrics.totalCommits).toBe(0);
    expect(result.metrics.totalContributors).toBe(0);
    expect(result.metrics.ponyFactor.factor).toBe(0);
    expect(result.metrics.ponyFactor.explanation).toBe(
      "0 contributors responsible for 0% of commits",
    );
  });
});
