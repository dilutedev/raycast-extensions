import { describe, expect, it } from "vitest";
import { adminItemTitle, formatLocalDate, formatTotals, planningRows, requestRef, windowStart } from "./formatting";
import type { DigestTotals, Issue } from "./kata";

describe("formatLocalDate", () => {
  it("formats using local calendar fields with zero padding", () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(formatLocalDate(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });
});

describe("formatTotals", () => {
  it("lists only non-zero totals and humanises underscores", () => {
    const totals = { created: 2, closed: 0, priority_set: 3, labeled: 1 } as DigestTotals;
    expect(formatTotals(totals)).toEqual(["2 created", "3 priority set", "1 labeled"]);
  });

  it("returns an empty list when nothing happened", () => {
    expect(formatTotals({ created: 0 } as DigestTotals)).toEqual([]);
  });
});

describe("windowStart", () => {
  it("returns an RFC 3339 UTC timestamp without fractional seconds", () => {
    const now = new Date("2026-11-08T10:30:15.123Z");
    expect(windowStart(24, now)).toBe("2026-11-07T10:30:15Z");
    expect(windowStart(168, now)).toBe("2026-11-01T10:30:15Z");
  });
});

describe("requestRef", () => {
  it("prefers a qualified id", () => {
    expect(requestRef({ qualified_id: "p#abcd", short_id: "zzzz", project: "q" })).toBe("p#abcd");
  });

  it("builds a qualified ref from project and short id", () => {
    expect(requestRef({ project_name: "p", short_id: "abcd" })).toBe("p#abcd");
    expect(requestRef({ project: "p", short_id: "abcd" })).toBe("p#abcd");
    expect(requestRef({ project_name: "p", issue_short_id: "abcd" })).toBe("p#abcd");
  });

  it("accepts an issue field only when it is qualified", () => {
    expect(requestRef({ issue: "p#abcd" })).toBe("p#abcd");
    expect(requestRef({ issue: "abcd" })).toBeUndefined();
  });
});

describe("planningRows", () => {
  const issue = (metadata?: Record<string, unknown>) => ({ metadata }) as Issue;

  it("returns nothing when no planning values are set", () => {
    expect(planningRows(issue({}), { deadline_on: null, scheduled_on: null })).toEqual([]);
    expect(planningRows(issue(), undefined)).toEqual([]);
  });

  it("includes dates and combines attention with its message", () => {
    const rows = planningRows(issue({ "work.attention": "stuck", "work.attention_msg": "waiting" }), {
      deadline_on: "2026-11-15",
      scheduled_on: "2026-11-10",
    });
    expect(rows).toEqual([
      { title: "Deadline", text: "2026-11-15" },
      { title: "Scheduled", text: "2026-11-10" },
      { title: "Attention", text: "stuck – waiting" },
    ]);
  });

  it("ignores non-string attention metadata", () => {
    expect(planningRows(issue({ "work.attention": 3 }), undefined)).toEqual([]);
  });
});

describe("adminItemTitle", () => {
  it("uses the first recognised identifying field", () => {
    expect(adminItemTitle({ uid: "u1", name: "nightly" })).toBe("nightly");
    expect(adminItemTitle({ id: 7 })).toBe("7");
  });

  it("falls back when no field is recognised", () => {
    expect(adminItemTitle({ other: true })).toBe("Untitled");
  });
});
