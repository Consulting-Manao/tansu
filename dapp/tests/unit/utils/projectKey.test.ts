import { describe, it, expect } from "vitest";
import { deriveProjectKey } from "../../../src/utils/projectKey";

// The on-chain contract derives the project key from keccak256 of the raw
// (case-sensitive) project name. These expectations pin that behavior so the
// frontend can never silently diverge from the contract again.
describe("deriveProjectKey", () => {
  it("hashes the raw name (case-sensitive), without lowercasing", () => {
    // keccak256("MyProject") — the actual on-chain key for a mixed-case name.
    expect(deriveProjectKey("MyProject").toString("hex")).toBe(
      "5cf9c0e95198ffeb9ef583d208e91798eb10bbf881ec2526939f24f8049e7556",
    );
  });

  it("derives a different key for the lowercase name (distinct projects)", () => {
    expect(deriveProjectKey("myproject").toString("hex")).toBe(
      "3908577ecee19ec0cddea99cf2a5d669521c838e1f57a619416f1e5311360ba4",
    );
  });

  it("does not collapse case: 'MyProject' and 'myproject' yield different keys", () => {
    expect(deriveProjectKey("MyProject").toString("hex")).not.toBe(
      deriveProjectKey("myproject").toString("hex"),
    );
  });

  it("leaves already-lowercase names unchanged (existing projects keep working)", () => {
    expect(deriveProjectKey("tansu").toString("hex")).toBe(
      deriveProjectKey("tansu".toLowerCase()).toString("hex"),
    );
  });

  it("returns a 32-byte key", () => {
    expect(deriveProjectKey("MyProject")).toHaveLength(32);
  });
});
