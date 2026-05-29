import { describe, expect, it } from "vitest";

import { validateGithubUrl } from "./validation";

describe("repository URL validation", () => {
  it("accepts supported provider URLs", () => {
    expect(validateGithubUrl("https://github.com/example/project")).toBeNull();
    expect(
      validateGithubUrl("https://gitlab.com/group/subgroup/project"),
    ).toBeNull();
    expect(
      validateGithubUrl("https://bitbucket.org/example/project"),
    ).toBeNull();
    expect(
      validateGithubUrl("git@codeberg.org:example/project.git"),
    ).toBeNull();
    expect(validateGithubUrl("https://gitea.com/example/project")).toBeNull();
    expect(validateGithubUrl("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5")).toBeNull();
  });

  it("rejects unsupported hosts", () => {
    expect(validateGithubUrl("https://example.org/team/project")).toBe(
      "Repository reference must be a supported Git provider URL or a public Radicle RID/URL",
    );
  });

  it("rejects non-https HTTP URLs", () => {
    expect(validateGithubUrl("http://github.com/example/project")).toBe(
      "Repository reference must be a supported Git provider URL or a public Radicle RID/URL",
    );
  });

  it("rejects unsupported ssh URL variants", () => {
    expect(validateGithubUrl("ssh://git@github.com/example/project.git")).toBe(
      "Repository reference must be a supported Git provider URL or a public Radicle RID/URL",
    );
  });
});
