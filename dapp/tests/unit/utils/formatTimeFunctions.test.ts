import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatTime,
  formatDate,
  formatDateTime,
  calculateDateDifference,
} from "../../../src/utils/formatTimeFunctions";

describe("formatTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Freeze time to a known date: 2026-06-15 (Monday)
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today, …" for today\'s dates', () => {
    const result = formatTime("2026-06-15T08:30:00Z");
    expect(result).toContain("Today");
  });

  it("returns a formatted date for non-today dates", () => {
    const result = formatTime("2026-06-14T08:30:00Z");
    expect(result).not.toContain("Today");
    expect(result).toContain("Jun");
  });

  it("returns a formatted date for dates in a different month", () => {
    const result = formatTime("2026-05-01T00:00:00Z");
    expect(result).toContain("May");
  });

  it("returns a formatted date for dates in a different year", () => {
    const result = formatTime("2025-12-25T00:00:00Z");
    expect(result).toContain("2025");
  });
});

describe("formatDate", () => {
  it("formats a date string in en-GB format", () => {
    const result = formatDate("2026-06-15T00:00:00Z");
    expect(result).toContain("15");
    expect(result).toContain("Jun");
    expect(result).toContain("2026");
  });

  it("handles end-of-year dates", () => {
    const result = formatDate("2026-12-31T00:00:00Z");
    expect(result).toContain("Dec");
  });

  it("formats early dates in the year", () => {
    const result = formatDate("2026-01-01T00:00:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("1");
  });
});

describe("formatDateTime", () => {
  it("includes both date and time components", () => {
    const result = formatDateTime("2026-06-15T14:30:00Z");
    expect(result).toContain("15");
    expect(result).toContain("Jun");
    expect(result).toContain("2026");
    // Should include a time component — the exact format depends on locale/timezone
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("calculateDateDifference", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for past dates", () => {
    const result = calculateDateDifference(
      Math.floor(new Date("2026-06-10T00:00:00Z").getTime() / 1000),
    );
    expect(result).toBeNull();
  });

  it("returns null for today", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = calculateDateDifference(now);
    expect(result).toBeNull();
  });

  it('returns "1 day" for tomorrow', () => {
    const tomorrow = Math.floor(
      new Date("2026-06-16T12:00:00Z").getTime() / 1000,
    );
    const result = calculateDateDifference(tomorrow);
    expect(result).toBe("1 day");
  });

  it('returns "X days" for future dates more than 1 day away', () => {
    const future = Math.floor(
      new Date("2026-06-20T12:00:00Z").getTime() / 1000,
    );
    const result = calculateDateDifference(future);
    expect(result).toBe("5 days");
  });

  it("returns 1 day for a date 12 hours in the future (ceil rounds up)", () => {
    // Frozen time: 2026-06-15T12:00:00Z
    // Input: 2026-06-16T00:00:00Z => diff = 12h => ceil(0.5) = 1
    const soon = Math.floor(new Date("2026-06-16T00:00:00Z").getTime() / 1000);
    const result = calculateDateDifference(soon);
    expect(result).toBe("1 day");
  });
});
