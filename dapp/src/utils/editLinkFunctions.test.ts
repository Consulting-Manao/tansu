import { describe, expect, it } from "vitest";

import {
  getRepositoryIconInfo,
  getRepositoryProvider,
} from "./editLinkFunctions";

describe("repository icon helpers", () => {
  it("maps supported providers to provider-specific icons", () => {
    expect(getRepositoryProvider("https://github.com/example/project")).toBe(
      "github",
    );
    expect(
      getRepositoryIconInfo("https://gitlab.com/group/subgroup/project").src,
    ).toBe("/icons/logos/gitlab.svg");
    expect(
      getRepositoryIconInfo("https://bitbucket.org/example/project").label,
    ).toBe("Bitbucket");
    expect(
      getRepositoryIconInfo("git@codeberg.org:example/project.git").provider,
    ).toBe("codeberg");
    expect(getRepositoryIconInfo("https://gitea.com/example/project").src).toBe(
      "/icons/logos/gitea.svg",
    );
  });

  it("falls back to the generic repository icon for unknown URLs", () => {
    expect(getRepositoryIconInfo("https://example.org/project/repo")).toEqual({
      src: "/icons/git.svg",
      label: "Repository",
    });
  });
});
