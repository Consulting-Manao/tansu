import { describe, expect, it } from "vitest";

import {
  buildRadicleBrowseUrl,
  buildRepositoryUrlFromProjectPath,
  getRepositoryCloneCommand,
  getRepositoryIconInfo,
  getRepositoryProvider,
  getRepositorySeedHost,
  isSupportedRepositoryUrl,
  normalizeRepositoryUrl,
  parseRepositoryUrl,
} from "../../../src/utils/editLinkFunctions";

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
    expect(getRepositoryProvider("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5")).toBe(
      "radicle",
    );
    expect(getRepositoryIconInfo("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5").src).toBe(
      "/icons/logos/radicle.svg",
    );
  });

  it("falls back to the generic repository icon for unknown URLs", () => {
    expect(getRepositoryIconInfo("https://example.org/project/repo")).toEqual({
      src: "/icons/git.svg",
      label: "Repository",
    });
  });
});

describe("parseRepositoryUrl", () => {
  it("parses supported https repository URLs", () => {
    expect(
      parseRepositoryUrl("https://github.com/example/project"),
    ).toMatchObject({
      host: "github.com",
      normalizedUrl: "https://github.com/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("normalizes GitHub tree URLs to the repository root", () => {
    expect(
      parseRepositoryUrl("https://github.com/example/project/tree/main"),
    ).toMatchObject({
      host: "github.com",
      normalizedUrl: "https://github.com/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("normalizes GitHub blob URLs to the repository root", () => {
    expect(
      parseRepositoryUrl(
        "https://github.com/example/project/blob/main/src/index.ts",
      ),
    ).toMatchObject({
      host: "github.com",
      normalizedUrl: "https://github.com/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("parses https repository URLs and preserves encoded segments", () => {
    expect(
      parseRepositoryUrl("https://gitlab.com/group/subgroup/hello%20world"),
    ).toMatchObject({
      host: "gitlab.com",
      normalizedUrl: "https://gitlab.com/group/subgroup/hello%20world",
      projectPath: "group/subgroup/hello world",
      owner: "subgroup",
      repoName: "hello world",
    });
  });

  it("normalizes GitLab tree URLs to the repository root", () => {
    expect(
      parseRepositoryUrl(
        "https://gitlab.com/group/subgroup/project/-/tree/main",
      ),
    ).toMatchObject({
      host: "gitlab.com",
      normalizedUrl: "https://gitlab.com/group/subgroup/project",
      projectPath: "group/subgroup/project",
      owner: "subgroup",
      repoName: "project",
    });
  });

  it("normalizes GitLab blob URLs to the repository root", () => {
    expect(
      parseRepositoryUrl(
        "https://gitlab.com/group/subgroup/project/-/blob/main/README.md",
      ),
    ).toMatchObject({
      host: "gitlab.com",
      normalizedUrl: "https://gitlab.com/group/subgroup/project",
      projectPath: "group/subgroup/project",
      owner: "subgroup",
      repoName: "project",
    });
  });

  it("parses unicode repository paths and normalizes them to encoded URLs", () => {
    expect(
      parseRepositoryUrl("https://codeberg.org/example/na%C3%AFve"),
    ).toMatchObject({
      host: "codeberg.org",
      normalizedUrl: "https://codeberg.org/example/na%C3%AFve",
      projectPath: "example/naïve",
      owner: "example",
      repoName: "naïve",
    });
  });

  it("normalizes Bitbucket src URLs to the repository root", () => {
    expect(
      parseRepositoryUrl(
        "https://bitbucket.org/workspace/repo/src/main/file.ts",
      ),
    ).toMatchObject({
      host: "bitbucket.org",
      normalizedUrl: "https://bitbucket.org/workspace/repo",
      projectPath: "workspace/repo",
      owner: "workspace",
      repoName: "repo",
    });
  });

  it("normalizes Codeberg src URLs to the repository root", () => {
    expect(
      parseRepositoryUrl(
        "https://codeberg.org/example/project/src/branch/main",
      ),
    ).toMatchObject({
      host: "codeberg.org",
      normalizedUrl: "https://codeberg.org/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("normalizes Gitea src URLs to the repository root", () => {
    expect(
      parseRepositoryUrl("https://gitea.com/example/project/src/branch/main"),
    ).toMatchObject({
      host: "gitea.com",
      normalizedUrl: "https://gitea.com/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("parses SCP-style SSH repository URLs", () => {
    expect(
      parseRepositoryUrl("git@codeberg.org:example/project.git"),
    ).toMatchObject({
      host: "codeberg.org",
      normalizedUrl: "https://codeberg.org/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("handles an https .git suffix", () => {
    expect(
      parseRepositoryUrl("https://github.com/example/project.git"),
    ).toMatchObject({
      host: "github.com",
      normalizedUrl: "https://github.com/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("normalizes host casing", () => {
    expect(
      parseRepositoryUrl("https://GitHub.com/example/project"),
    ).toMatchObject({
      host: "github.com",
      normalizedUrl: "https://github.com/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("rejects non-default https ports", () => {
    expect(
      parseRepositoryUrl("https://github.com:8443/example/project"),
    ).toBeUndefined();
  });

  it("accepts the default https port", () => {
    expect(
      parseRepositoryUrl("https://github.com:443/example/project"),
    ).toMatchObject({
      host: "github.com",
      normalizedUrl: "https://github.com/example/project",
      projectPath: "example/project",
      owner: "example",
      repoName: "project",
    });
  });

  it("rejects malformed, incomplete, and empty inputs", () => {
    expect(parseRepositoryUrl("https://github.com/example")).toBeUndefined();
    expect(parseRepositoryUrl("not-a-url")).toBeUndefined();
    expect(parseRepositoryUrl("")).toBeUndefined();
    expect(parseRepositoryUrl(null)).toBeUndefined();
    expect(parseRepositoryUrl(undefined)).toBeUndefined();
  });

  it("parses direct Radicle RIDs and scheme URLs", () => {
    expect(parseRepositoryUrl("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5")).toEqual({
      kind: "radicle",
      provider: "radicle",
      normalizedUrl: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      rid: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
    });
    expect(parseRepositoryUrl("rad://z3gqcJUoA1n9HaHKufZs5FCSGazv5")).toEqual({
      kind: "radicle",
      provider: "radicle",
      normalizedUrl: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      rid: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
    });
  });

  it("parses public Radicle seed URLs and keeps the explicit seed host", () => {
    expect(
      parseRepositoryUrl(
        "https://seed.example/api/v1/repos/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toEqual({
      kind: "radicle",
      provider: "radicle",
      normalizedUrl: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      rid: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      seedHost: "seed.example",
    });
  });

  it("parses Radicle seed git URLs and keeps the explicit seed host", () => {
    expect(
      parseRepositoryUrl(
        "https://seed.example/z3gqcJUoA1n9HaHKufZs5FCSGazv5.git",
      ),
    ).toEqual({
      kind: "radicle",
      provider: "radicle",
      normalizedUrl: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      rid: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      seedHost: "seed.example",
    });
  });

  it("parses Radicle explorer URLs and preserves hostname-based node paths", () => {
    expect(
      parseRepositoryUrl(
        "https://radicle.network/nodes/node.example/rad%3Az3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toEqual({
      kind: "radicle",
      provider: "radicle",
      normalizedUrl: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      rid: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      seedHost: "node.example",
    });
  });

  it("rejects arbitrary HTTPS URLs that only contain a Radicle RID substring", () => {
    expect(
      parseRepositoryUrl(
        "https://example.org/docs/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toBeUndefined();
    expect(
      parseRepositoryUrl(
        "https://example.org/search?q=rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toBeUndefined();
    expect(
      parseRepositoryUrl(
        "https://radicle.network/search?q=rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toBeUndefined();
    expect(
      parseRepositoryUrl("rad://z3gqcJUoA1n9HaHKufZs5FCSGazv5/tree/main"),
    ).toBeUndefined();
  });
});

describe("repository URL validation", () => {
  it("accepts supported https and SCP-style SSH repository URLs", () => {
    expect(isSupportedRepositoryUrl("https://github.com/example/project")).toBe(
      true,
    );
    expect(
      isSupportedRepositoryUrl("https://github.com/example/project/tree/main"),
    ).toBe(true);
    expect(
      isSupportedRepositoryUrl(
        "https://gitlab.com/group/subgroup/project/-/tree/main",
      ),
    ).toBe(true);
    expect(
      isSupportedRepositoryUrl("https://bitbucket.org/workspace/repo/src/main"),
    ).toBe(true);
    expect(
      isSupportedRepositoryUrl(
        "https://codeberg.org/example/project/src/branch/main",
      ),
    ).toBe(true);
    expect(
      isSupportedRepositoryUrl(
        "https://gitea.com/example/project/src/branch/main",
      ),
    ).toBe(true);
    expect(
      isSupportedRepositoryUrl("git@codeberg.org:example/project.git"),
    ).toBe(true);
    expect(isSupportedRepositoryUrl("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5")).toBe(
      true,
    );
    expect(
      isSupportedRepositoryUrl("rad://z3gqcJUoA1n9HaHKufZs5FCSGazv5"),
    ).toBe(true);
    expect(
      isSupportedRepositoryUrl(
        "https://seed.example/api/v1/repos/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toBe(true);
  });

  it("rejects unsupported formats and hosts", () => {
    expect(
      isSupportedRepositoryUrl("ssh://git@github.com/example/project.git"),
    ).toBe(false);
    expect(
      isSupportedRepositoryUrl("https://github.com:8443/example/project"),
    ).toBe(false);
    expect(
      isSupportedRepositoryUrl("https://github.com:8080/example/project"),
    ).toBe(false);
    expect(
      isSupportedRepositoryUrl("https://github.com:22/example/project"),
    ).toBe(false);
    expect(
      isSupportedRepositoryUrl("https://example.org/example/project"),
    ).toBe(false);
    expect(isSupportedRepositoryUrl("https://127.0.0.1/example/project")).toBe(
      false,
    );
    expect(isSupportedRepositoryUrl("https://10.0.0.12/example/project")).toBe(
      false,
    );
  });

  it("rejects malformed, incomplete, and empty inputs", () => {
    expect(isSupportedRepositoryUrl("https://github.com/example")).toBe(false);
    expect(isSupportedRepositoryUrl("")).toBe(false);
    expect(isSupportedRepositoryUrl(null)).toBe(false);
    expect(isSupportedRepositoryUrl(undefined)).toBe(false);
  });
});

describe("normalizeRepositoryUrl", () => {
  it("returns the canonical repository root for supported subresource URLs", () => {
    expect(
      normalizeRepositoryUrl(
        "https://gitlab.com/group/subgroup/project/-/blob/main/README.md",
      ),
    ).toBe("https://gitlab.com/group/subgroup/project");
    expect(
      normalizeRepositoryUrl(
        "https://github.com/example/project/tree/main/src",
      ),
    ).toBe("https://github.com/example/project");
  });

  it("converts supported SSH URLs to the canonical HTTPS repository root", () => {
    expect(normalizeRepositoryUrl("git@codeberg.org:example/project.git")).toBe(
      "https://codeberg.org/example/project",
    );
  });

  it("returns undefined for malformed or unsupported URLs", () => {
    expect(normalizeRepositoryUrl("https://example.org/example/project")).toBe(
      undefined,
    );
    expect(normalizeRepositoryUrl("not-a-url")).toBe(undefined);
  });

  it("normalizes Radicle references to canonical RIDs", () => {
    expect(
      normalizeRepositoryUrl(
        "https://seed.example/api/v1/repos/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toBe("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5");
  });
});

describe("buildRepositoryUrlFromProjectPath", () => {
  it("uses the canonical repository host when ORG_GITHUB is present", () => {
    expect(
      buildRepositoryUrlFromProjectPath(
        "https://gitlab.com/group/project",
        "group/docs",
      ),
    ).toBe("https://gitlab.com/group/docs");
  });

  it("does not guess a provider when the canonical repository URL is missing", () => {
    expect(buildRepositoryUrlFromProjectPath("", "group/docs")).toBeUndefined();
  });
});

describe("Radicle repository helpers", () => {
  it("builds public browse URLs and clone commands for Radicle repositories", () => {
    expect(
      buildRadicleBrowseUrl(
        "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
        "seed.example",
      ),
    ).toBe(
      "https://radicle.network/nodes/seed.example/rad%3Az3gqcJUoA1n9HaHKufZs5FCSGazv5",
    );
    expect(getRepositoryCloneCommand("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5")).toBe(
      "rad clone rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
    );
    expect(buildRadicleBrowseUrl("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5")).toBe(
      "https://radicle.network/nodes/iris.radicle.network/rad%3Az3gqcJUoA1n9HaHKufZs5FCSGazv5",
    );
    expect(
      getRepositorySeedHost(
        "https://seed.example/api/v1/repos/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
      ),
    ).toBe("seed.example");
  });
});
