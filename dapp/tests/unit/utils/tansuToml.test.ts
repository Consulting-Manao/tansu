import toml from "toml";
import { describe, expect, it } from "vitest";
import { ProjectType } from "../../../src/types/projectConfig";
import {
  validateFullName,
  validateHandle,
  validateOrganization,
  writeTansuToml,
  type TansuTomlForm,
} from "../../../src/utils/tansuToml";

const RID = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

const form: TansuTomlForm = {
  projectType: ProjectType.SOFTWARE,
  maintainers: ["GA", "GB"],
  handles: ["ada", "grace"],
  fullName: 'The "Demo" Project',
  orgName: "Demo Foundation",
  orgUrl: "https://demo.example",
  orgLogo: "",
  orgDescription: "A project to try Tansu with.",
  repositoryUrl: "https://github.com/demo/demo",
  repositoryProvider: "github",
};

describe("writeTansuToml", () => {
  it("writes a new file that reads back as the form", () => {
    const data = toml.parse(writeTansuToml(form));
    expect(data).toEqual({
      VERSION: "2.0.0",
      PROJECT_TYPE: "SOFTWARE",
      ACCOUNTS: ["GA", "GB"],
      DOCUMENTATION: {
        ORG_DBA: 'The "Demo" Project',
        ORG_NAME: "Demo Foundation",
        ORG_URL: "https://demo.example",
        ORG_LOGO: "",
        ORG_DESCRIPTION: "A project to try Tansu with.",
        ORG_GITHUB: "demo/demo",
      },
      PRINCIPALS: [{ github: "ada" }, { github: "grace" }],
    });
  });

  it("keeps what the form does not manage", () => {
    const previous = {
      VERSION: "1.0.0",
      NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      DOCUMENTATION: { ORG_TWITTER: "demo", README: "# Old", ORG_NAME: "Old" },
    };
    const data = toml.parse(writeTansuToml(form, previous));
    expect(data.VERSION).toBe("2.0.0");
    expect(data.NETWORK_PASSPHRASE).toBe("Test SDF Network ; September 2015");
    expect(data.DOCUMENTATION.ORG_TWITTER).toBe("demo");
    expect(data.DOCUMENTATION.ORG_NAME).toBe("Demo Foundation");
    // The README is a file of its own.
    expect(data.DOCUMENTATION.README).toBeUndefined();
  });

  it("names a Radicle repository's seed, and keeps it for the same one", () => {
    const radicle = {
      ...form,
      repositoryUrl: `https://radicle.network/nodes/seed.example/${RID}`,
      repositoryProvider: "radicle" as const,
    };
    const created = toml.parse(writeTansuToml(radicle));
    expect(created.DOCUMENTATION).toMatchObject({
      ORG_REPOSITORY_PROVIDER: "radicle",
      ORG_REPOSITORY_SEED: "seed.example",
    });
    expect(created.DOCUMENTATION.ORG_GITHUB).toBeUndefined();
    expect(created.PRINCIPALS).toEqual([
      { radicle: "ada" },
      { radicle: "grace" },
    ]);

    // The bare RID of the same repository keeps its seed; another drops it.
    const bare = { ...radicle, repositoryUrl: RID };
    expect(
      toml.parse(writeTansuToml(bare, created, radicle.repositoryUrl))
        .DOCUMENTATION.ORG_REPOSITORY_SEED,
    ).toBe("seed.example");
    expect(
      toml.parse(
        writeTansuToml(
          { ...bare, repositoryUrl: "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5" },
          created,
          radicle.repositoryUrl,
        ),
      ).DOCUMENTATION.ORG_REPOSITORY_SEED,
    ).toBeUndefined();
  });

  it("writes no repository for a project without code", () => {
    const data = toml.parse(
      writeTansuToml({ ...form, projectType: ProjectType.GENERIC }),
    );
    expect(data.PROJECT_TYPE).toBe("GENERIC");
    expect(data.DOCUMENTATION.ORG_GITHUB).toBeUndefined();
  });
});

describe("tansu.toml form rules", () => {
  it("checks the full name", () => {
    expect(validateFullName("Demo")).toBeNull();
    expect(validateFullName("  ")).toBe("Project full name is required");
    expect(validateFullName("x".repeat(101))).toContain("100 characters");
    expect(validateFullName("Démo")).toContain("ASCII");
  });

  it("checks a handle", () => {
    expect(validateHandle("ada_lovelace-1", "GitHub Handle")).toBeNull();
    expect(validateHandle("", "GitHub Handle")).toBe(
      "GitHub Handle is required",
    );
    expect(validateHandle("ada lovelace", "GitHub Handle")).toContain(
      "ASCII letters",
    );
  });

  it("checks the organization", () => {
    expect(validateOrganization(form)).toEqual({});
    expect(
      validateOrganization({
        orgName: "",
        orgUrl: "http://demo.example",
        orgLogo: "ftp://logo",
        orgDescription: "Too short",
      }),
    ).toEqual({
      orgName: "Organization name is required",
      orgUrl: "URL must start with https://",
      orgLogo: "Logo URL must start with https://",
      orgDescription: "Description must contain at least 3 words",
    });
  });
});
