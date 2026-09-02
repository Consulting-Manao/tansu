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
  it("covers all 3 outcome types", () => {
    for (const outcomeType of OUTCOME_TYPES) {
      const templates = OUTCOME_TEMPLATES.filter(
        (template) => template.outcomeType === outcomeType,
      );
      expect(templates.length).toBeGreaterThan(0);
    }
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

  it("pre-fills contract calls only on templates that execute an action", () => {
    // Approved templates execute real actions, so they should come with a
    // contract-call pre-fill (function + args) while the no-action rejected /
    // cancelled templates stay description-only.
    const approved = getOutcomeTemplatesByType("approved");
    for (const template of approved) {
      expect(template.contract).toBeDefined();
      expect(template.contract!.execute_fn.trim().length).toBeGreaterThan(0);
      expect(template.contract!.address).toBe(""); // filled by the author
    }

    for (const type of ["rejected", "cancelled"] as const) {
      for (const template of getOutcomeTemplatesByType(type)) {
        expect(template.contract).toBeUndefined();
        expect(template.xdr).toBeUndefined();
      }
    }
  });
});

describe("getOutcomeTemplatesByType", () => {
  it("returns only templates matching the requested outcome type", () => {
    for (const outcomeType of OUTCOME_TYPES) {
      const templates = getOutcomeTemplatesByType(outcomeType);
      expect(templates.length).toBeGreaterThan(0);
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
    const approved = getOutcomeTemplatesByType("approved");
    for (const template of approved) {
      expect(getOutcomeTemplateFills(template)).toContain("contract call");
    }
  });

  it("reports only the description for no-action templates", () => {
    const rejected = getOutcomeTemplatesByType("rejected");
    expect(getOutcomeTemplateFills(rejected[0]!)).toEqual(["description"]);
  });
});
