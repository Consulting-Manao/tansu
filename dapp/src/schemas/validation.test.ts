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
  });

  it("rejects unsupported hosts", () => {
    expect(validateGithubUrl("https://example.org/team/project")).toBe(
      "Repository URL must use HTTPS or SSH and target GitHub, GitLab, Bitbucket, Codeberg, or Gitea",
    );
  });

  it("rejects non-https HTTP URLs", () => {
    expect(validateGithubUrl("http://github.com/example/project")).toBe(
      "Repository URL must use HTTPS or SSH and target GitHub, GitLab, Bitbucket, Codeberg, or Gitea",
    );
  });
});
