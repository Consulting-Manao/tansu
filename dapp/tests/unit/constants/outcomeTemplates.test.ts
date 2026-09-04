import { describe, it, expect } from "vitest";
import {
  OUTCOME_TEMPLATES,
  getOutcomeTemplatesByType,
  getOutcomeTemplateById,
  getOutcomeTemplateFills,
  type OutcomeType,
} from "../../../src/constants/outcomeTemplates";

const OUTCOME_TYPES: OutcomeType[] = ["approved", "rejected", "cancelled"];

describe("OUTCOME_TEMPLATES", () => {
  it("contains only the curated registry and public-goods templates", () => {
    expect(OUTCOME_TEMPLATES).toHaveLength(2);
    expect(OUTCOME_TEMPLATES.map((template) => template.id)).toEqual([
      "interact-stellar-registry",
      "public-goods-award",
    ]);
    expect(
      OUTCOME_TEMPLATES.every(
        (template) => template.outcomeType === "approved",
      ),
    ).toBe(true);
  });

  it("has unique ids", () => {
    const ids = OUTCOME_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defines all required fields for every template", () => {
    for (const template of OUTCOME_TEMPLATES) {
      expect(template.id.trim().length).toBeGreaterThan(0);
      expect(template.name.trim().length).toBeGreaterThan(0);
      expect(template.description.trim().length).toBeGreaterThan(0);
      expect(template.content.trim().length).toBeGreaterThan(0);
      expect(OUTCOME_TYPES).toContain(template.outcomeType);
    }
  });

  it("produces descriptions long enough to pass validation", () => {
    // Outcome descriptions are validated with textContentSchema(3, ...)
    // (at least 3 words), so all template contents must clear that bar.
    for (const template of OUTCOME_TEMPLATES) {
      const words = template.content.trim().split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(3);
    }
  });

  it("pre-fills the registry contract call and leaves its address for resolution", () => {
    const registry = getOutcomeTemplateById("interact-stellar-registry")!;
    expect(registry.contract).toEqual({
      address: "",
      execute_fn: "publish_hash",
      args: [
        "registry-tansu-manager",
        "GAMPJROHOAW662FINQ4XQOY2ULX5IEGYXCI4SMZYE75EHQBR6PSTJG3M",
        "f13e2e9d329a1b5e72eed4c3203f98c36d513e9915de2482c229fbe4367e6591",
        "0.1.0",
      ],
    });
    expect(
      getOutcomeTemplateById("public-goods-award")?.contract,
    ).toBeUndefined();
  });
});

describe("getOutcomeTemplatesByType", () => {
  it("returns only templates matching the requested outcome type", () => {
    for (const outcomeType of OUTCOME_TYPES) {
      const templates = getOutcomeTemplatesByType(outcomeType);
      for (const template of templates) {
        expect(template.outcomeType).toBe(outcomeType);
      }
    }
  });

  it("returns templates in a stable order matching OUTCOME_TEMPLATES", () => {
    expect(getOutcomeTemplatesByType("approved")).toEqual(
      OUTCOME_TEMPLATES.filter(
        (template) => template.outcomeType === "approved",
      ),
    );
  });
});

describe("getOutcomeTemplateById", () => {
  it("returns the template matching the id", () => {
    const first = OUTCOME_TEMPLATES[0]!;
    expect(getOutcomeTemplateById(first.id)).toEqual(first);
  });

  it("returns undefined for an unknown id", () => {
    expect(getOutcomeTemplateById("does-not-exist")).toBeUndefined();
  });
});

describe("getOutcomeTemplateFills", () => {
  it("always includes the description", () => {
    for (const template of OUTCOME_TEMPLATES) {
      expect(getOutcomeTemplateFills(template)).toContain("description");
    }
  });

  it("reports contract-call pre-fill when the template has one", () => {
    expect(
      getOutcomeTemplateFills(
        getOutcomeTemplateById("interact-stellar-registry")!,
      ),
    ).toContain("contract call");
  });

  it("reports only the description for no-action templates", () => {
    expect(
      getOutcomeTemplateFills(getOutcomeTemplateById("public-goods-award")!),
    ).toEqual(["description"]);
  });
});
