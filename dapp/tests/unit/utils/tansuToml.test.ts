import { parse as parseToml } from "smol-toml";
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

/** The written file, as data to assert on. */
const parse = (text: string): any => parseToml(text);

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
    const data = parse(writeTansuToml(form));
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
      CURRENCIES: [{ code: "DEMO", issuer: "GC" }],
      DOCUMENTATION: {
        ORG_TWITTER: "demo",
        ORG_KEYWORDS: ["git", "dao"],
        README: "# Old",
        ORG_NAME: "Old",
      },
    };
    const data = parse(writeTansuToml(form, previous));
    expect(data.VERSION).toBe("2.0.0");
    expect(data.NETWORK_PASSPHRASE).toBe("Test SDF Network ; September 2015");
    expect(data.CURRENCIES).toEqual([{ code: "DEMO", issuer: "GC" }]);
    expect(data.DOCUMENTATION.ORG_TWITTER).toBe("demo");
    expect(data.DOCUMENTATION.ORG_KEYWORDS).toEqual(["git", "dao"]);
    expect(data.DOCUMENTATION.ORG_NAME).toBe("Demo Foundation");
    // The README is a file of its own.
    expect(data.DOCUMENTATION.README).toBeUndefined();
  });

  it("keeps each maintainer's principal entry, by address", () => {
    const previous = {
      ACCOUNTS: ["GB", "GA"],
      PRINCIPALS: [
        { github: "grace", email: "grace@demo.example" },
        { github: "old-ada", keybase: "ada" },
      ],
    };
    const radicle = {
      ...form,
      maintainers: ["GA", "GB", "GC"],
      handles: ["ada", "grace", "linus"],
      repositoryUrl: RID,
      repositoryProvider: "radicle" as const,
    };
    expect(parse(writeTansuToml(radicle, previous)).PRINCIPALS).toEqual([
      { keybase: "ada", radicle: "ada" },
      { email: "grace@demo.example", radicle: "grace" },
      { radicle: "linus" },
    ]);
  });

  it("names a Radicle repository's seed, and keeps it for the same one", () => {
    const radicle = {
      ...form,
      repositoryUrl: `https://radicle.network/nodes/seed.example/${RID}`,
      repositoryProvider: "radicle" as const,
    };
    const created = parse(writeTansuToml(radicle));
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
      parse(writeTansuToml(bare, created, radicle.repositoryUrl)).DOCUMENTATION
        .ORG_REPOSITORY_SEED,
    ).toBe("seed.example");
    expect(
      parse(
        writeTansuToml(
          { ...bare, repositoryUrl: "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5" },
          created,
          radicle.repositoryUrl,
        ),
      ).DOCUMENTATION.ORG_REPOSITORY_SEED,
    ).toBeUndefined();
  });

  it("writes no repository for a project without code", () => {
    const data = parse(
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
