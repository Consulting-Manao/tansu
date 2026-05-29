import { describe, it, expect } from "vitest";
import {
  stellarAddressSchema,
  stellarPrincipalSchema,
  validateGithubUrl,
  validateStellarAddress,
  validateMaintainerAddress,
} from "./validation";

const validAccount = "G" + "A".repeat(55);
const validContract = "C" + "A".repeat(55);

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

describe("stellarAddressSchema (account-only)", () => {
  it("accepts a 56-char G... address", () => {
    expect(stellarAddressSchema.safeParse(validAccount).success).toBe(true);
  });

  it("rejects a C... contract address", () => {
    expect(stellarAddressSchema.safeParse(validContract).success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(stellarAddressSchema.safeParse("").success).toBe(false);
  });

  it("rejects a wrong-length string", () => {
    expect(stellarAddressSchema.safeParse("GABC").success).toBe(false);
  });

  it("rejects an M... muxed account", () => {
    expect(stellarAddressSchema.safeParse("M" + "A".repeat(55)).success).toBe(
      false,
    );
  });
});

describe("stellarPrincipalSchema (account or contract)", () => {
  it("accepts a 56-char G... account address", () => {
    expect(stellarPrincipalSchema.safeParse(validAccount).success).toBe(true);
  });

  it("accepts a 56-char C... contract address", () => {
    expect(stellarPrincipalSchema.safeParse(validContract).success).toBe(true);
  });

  it("rejects an M... muxed account", () => {
    expect(stellarPrincipalSchema.safeParse("M" + "A".repeat(55)).success).toBe(
      false,
    );
  });

  it("rejects an empty string", () => {
    expect(stellarPrincipalSchema.safeParse("").success).toBe(false);
  });

  it("rejects a wrong-length C-prefixed string", () => {
    expect(stellarPrincipalSchema.safeParse("CABC").success).toBe(false);
  });
});

describe("validateMaintainerAddress", () => {
  it("returns null for a G... address", () => {
    expect(validateMaintainerAddress(validAccount)).toBeNull();
  });

  it("returns null for a C... address (the regression this PR fixes)", () => {
    expect(validateMaintainerAddress(validContract)).toBeNull();
  });

  it("returns an error string for garbage input", () => {
    expect(validateMaintainerAddress("not-an-address")).toBeTruthy();
  });
});

describe("validateStellarAddress", () => {
  it("returns null for a G... address", () => {
    expect(validateStellarAddress(validAccount)).toBeNull();
  });

  it("returns an error for a C... contract (G-only context)", () => {
    expect(validateStellarAddress(validContract)).toBeTruthy();
  });
});
