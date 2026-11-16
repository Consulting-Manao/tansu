import { describe, expect, it } from "vitest";
import { earlyExecution } from "../../../src/utils/utils";

describe("earlyExecution", () => {
  const now = 1_000_000;
  const endDate = 2_000; // seconds: the vote still runs
  const executableAt = (endDate + 3_600) * 1000;
  const maintainers = ["GA", "GB", "GC"];
  const proposal = (
    voters: string[],
    status: "active" | "voted" = "active",
  ) => ({
    status,
    endDate,
    voters,
  });

  it("opens once the threshold of current maintainers voted", () => {
    // 66% of three maintainers: two must vote; other voters do not count.
    expect(
      earlyExecution(
        proposal(["GA", "GX"]),
        maintainers,
        66,
        executableAt,
        now,
      ),
    ).toBeNull();
    expect(
      earlyExecution(
        proposal(["GA", "GC"]),
        maintainers,
        66,
        executableAt,
        now,
      ),
    ).toEqual({ voted: 2, total: 3, executableAt, running: true });
  });

  it("stops at the normal time, and tells when the vote ended", () => {
    expect(
      earlyExecution(
        proposal(["GA", "GB"]),
        maintainers,
        66,
        executableAt,
        executableAt,
      ),
    ).toBeNull();
    expect(
      earlyExecution(
        proposal(["GA", "GB"], "voted"),
        maintainers,
        66,
        executableAt,
        endDate * 1000 + 1,
      ),
    ).toMatchObject({ running: false });
  });
});
