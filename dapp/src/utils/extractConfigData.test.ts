import { describe, expect, it } from "vitest";
import { extractConfigData } from "./utils";

const minimalProject = {
  name: "myproject",
  config: { url: "https://github.com/org/repo", ipfs: "bafy..." },
  maintainers: ["GAAA..."],
  sub_projects: [],
};

describe("extractConfigData", () => {
  it("returns project name and github from project", () => {
    const toml = {
      DOCUMENTATION: {
        ORG_NAME: "My Org",
        ORG_LOGO: "",
        ORG_THUMBNAIL: "",
        ORG_DESCRIPTION: "Desc",
        ORG_URL: "https://example.com",
      },
      PRINCIPALS: [{ github: "alice" }],
      ACCOUNTS: ["GAAA..."],
    };
    const out = extractConfigData(toml, minimalProject as any);
    expect(out.projectName).toBe("myproject");
    expect(out.officials.githubLink).toBe("https://github.com/org/repo");
    expect(out.organizationName).toBe("My Org");
    expect(out.authorGithubNames).toEqual(["alice"]);
    expect(out.maintainersAddresses).toEqual(["GAAA..."]);
  });

  it("handles missing toml fields with defaults", () => {
    const out = extractConfigData({}, minimalProject as any);
    expect(out.projectName).toBe("myproject");
    expect(out.logoImageLink).toBe("");
    expect(out.description).toBe("");
    expect(out.authorGithubNames).toEqual([]);
  });

  it("keeps the canonical provider when ORG_GITHUB is set", () => {
    const project = {
      ...minimalProject,
      config: { url: "https://gitlab.com/org/repo", ipfs: "bafy..." },
    };

    const out = extractConfigData(
      {
        DOCUMENTATION: {
          ORG_GITHUB: "org/alt-repo",
        },
      },
      project as any,
    );

    expect(out.officials.githubLink).toBe("https://gitlab.com/org/alt-repo");
  });

  it("preserves unsupported repository URLs when normalization fails", () => {
    const project = {
      ...minimalProject,
      config: { url: "https://example.org/org/repo", ipfs: "bafy..." },
    };

    const out = extractConfigData({}, project as any);

    expect(out.officials.githubLink).toBe("https://example.org/org/repo");
  });

  it("builds public Radicle browse links and reads Radicle principal aliases", () => {
    const project = {
      ...minimalProject,
      config: { url: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5", ipfs: "bafy..." },
    };

    const out = extractConfigData(
      {
        DOCUMENTATION: {
          ORG_REPOSITORY_SEED: "seed.radicle.xyz",
        },
        PRINCIPALS: [{ radicle: "cloudhead" }],
      },
      project as any,
    );

    expect(out.officials.githubLink).toBe(
      "https://radicle.network/nodes/seed.radicle.xyz/rad%3Az3gqcJUoA1n9HaHKufZs5FCSGazv5",
    );
    expect(out.authorGithubNames).toEqual(["cloudhead"]);
  });
});
