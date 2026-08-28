import { describe, it, expect } from "vitest";
import {
  OUTCOME_TEMPLATES,
  getOutcomeTemplatesByType,
  getOutcomeTemplateById,
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
