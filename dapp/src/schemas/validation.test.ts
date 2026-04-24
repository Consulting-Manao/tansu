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
      "Repository URL must use HTTPS or SCP-style SSH (git@host:owner/repo) and target GitHub, GitLab, Bitbucket, Codeberg, or Gitea",
    );
  });

  it("rejects non-https HTTP URLs", () => {
    expect(validateGithubUrl("http://github.com/example/project")).toBe(
      "Repository URL must use HTTPS or SCP-style SSH (git@host:owner/repo) and target GitHub, GitLab, Bitbucket, Codeberg, or Gitea",
    );
  });

  it("rejects unsupported ssh URL variants", () => {
    expect(validateGithubUrl("ssh://git@github.com/example/project.git")).toBe(
      "Repository URL must use HTTPS or SCP-style SSH (git@host:owner/repo) and target GitHub, GitLab, Bitbucket, Codeberg, or Gitea",
    );
  });
});
