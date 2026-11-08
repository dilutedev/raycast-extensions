import { describe, expect, it } from "vitest";
import { matchesQuery, parseQuery } from "./issue-filter";
import type { Issue } from "./kata";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    uid: "uid-1",
    short_id: "abc1",
    qualified_id: "proj#abc1",
    project_name: "proj",
    title: "Some title",
    body: "Some body",
    status: "open",
    web_url: "http://localhost/1",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const emptyQuery = { words: [], labels: [], unowned: false, ready: false };

describe("parseQuery", () => {
  it("returns the default query for empty and whitespace-only input", () => {
    expect(parseQuery("")).toEqual(emptyQuery);
    expect(parseQuery("  \t ")).toEqual(emptyQuery);
  });

  it("lowercases plain words and tolerates repeated whitespace", () => {
    expect(parseQuery("Foo \t  BAR")).toEqual({ ...emptyQuery, words: ["foo", "bar"] });
  });

  it("accumulates labels, case-insensitively", () => {
    expect(parseQuery("label:Bug LABEL:UI").labels).toEqual(["bug", "ui"]);
  });

  it("parses owner and owner:none", () => {
    expect(parseQuery("owner:Alice")).toEqual({ ...emptyQuery, owner: "alice" });
    for (const q of ["owner:none", "owner:NONE"]) {
      const parsed = parseQuery(q);
      expect(parsed.unowned).toBe(true);
      expect(parsed.owner).toBeUndefined();
    }
  });

  it("parses priority equality and <= forms, case-insensitively", () => {
    expect(parseQuery("p:2").priority).toEqual({ op: "eq", n: 2 });
    expect(parseQuery("p:<=1").priority).toEqual({ op: "le", n: 1 });
    expect(parseQuery("P:3").priority).toEqual({ op: "eq", n: 3 });
  });

  it("treats out-of-range or malformed priority tokens as plain words", () => {
    const q = parseQuery("p:5 p:<=9 p:x");
    expect(q.priority).toBeUndefined();
    expect(q.words).toEqual(["p:5", "p:<=9", "p:x"]);
  });

  it("parses is:ready and treats other is: tokens as words", () => {
    expect(parseQuery("is:ready").ready).toBe(true);
    const q = parseQuery("is:blocked");
    expect(q.ready).toBe(false);
    expect(q.words).toEqual(["is:blocked"]);
  });

  it("drops bare prefixes", () => {
    expect(parseQuery("label: owner: p: is:")).toEqual(emptyQuery);
  });

  it("is last-wins for owner and priority", () => {
    const q = parseQuery("owner:a owner:b p:1 p:<=3");
    expect(q.owner).toBe("b");
    expect(q.priority).toEqual({ op: "le", n: 3 });
  });

  it("parses a mixed query", () => {
    expect(parseQuery("Login label:Bug owner:Alice p:<=2 is:ready crash")).toEqual({
      words: ["login", "crash"],
      labels: ["bug"],
      owner: "alice",
      unowned: false,
      priority: { op: "le", n: 2 },
      ready: true,
    });
  });
});

describe("matchesQuery", () => {
  it("matches everything for an empty query", () => {
    const q = parseQuery("");
    expect(matchesQuery(issue(), q)).toBe(true);
    expect(matchesQuery(issue({ status: "closed" }), q)).toBe(true);
  });

  it("is:ready accepts open unblocked issues only", () => {
    const q = parseQuery("is:ready");
    expect(matchesQuery(issue(), q)).toBe(true);
    expect(matchesQuery(issue({ status: "closed" }), q)).toBe(false);
    expect(matchesQuery(issue({ blocked: true }), q)).toBe(false);
  });

  it("requires every label, case-insensitively", () => {
    const q = parseQuery("label:bug label:ui");
    expect(matchesQuery(issue({ labels: ["BUG", "ui", "x"] }), q)).toBe(true);
    expect(matchesQuery(issue({ labels: ["bug"] }), q)).toBe(false);
    expect(matchesQuery(issue(), q)).toBe(false);
  });

  it("owner:none rejects owned issues", () => {
    const q = parseQuery("owner:none");
    expect(matchesQuery(issue(), q)).toBe(true);
    expect(matchesQuery(issue({ owner: "alice" }), q)).toBe(false);
  });

  it("matches owner case-insensitively and rejects a missing owner", () => {
    const q = parseQuery("owner:alice");
    expect(matchesQuery(issue({ owner: "Alice" }), q)).toBe(true);
    expect(matchesQuery(issue({ owner: "bob" }), q)).toBe(false);
    expect(matchesQuery(issue(), q)).toBe(false);
  });

  it("applies p: equality and <= boundaries", () => {
    const eq = parseQuery("p:1");
    expect(matchesQuery(issue({ priority: 1 }), eq)).toBe(true);
    expect(matchesQuery(issue({ priority: 0 }), eq)).toBe(false);
    expect(matchesQuery(issue({ priority: 2 }), eq)).toBe(false);

    const le = parseQuery("p:<=1");
    expect(matchesQuery(issue({ priority: 0 }), le)).toBe(true);
    expect(matchesQuery(issue({ priority: 1 }), le)).toBe(true);
    expect(matchesQuery(issue({ priority: 2 }), le)).toBe(false);
  });

  it("never matches a p: filter when priority is undefined", () => {
    expect(matchesQuery(issue(), parseQuery("p:1"))).toBe(false);
    expect(matchesQuery(issue(), parseQuery("p:<=4"))).toBe(false);
  });

  it("matches words against title, ids, project, owner, labels and priority", () => {
    const i = issue({
      title: "Fix Login",
      short_id: "zz99",
      qualified_id: "web#zz99",
      project_name: "webapp",
      owner: "carol",
      labels: ["regression"],
      priority: 1,
    });
    for (const w of ["login", "zz99", "web#zz99", "webapp", "carol", "regress", "p1"]) {
      expect(matchesQuery(i, parseQuery(w)), w).toBe(true);
    }
    expect(matchesQuery(i, parseQuery("nomatch"))).toBe(false);
  });

  it("ANDs multiple words", () => {
    const i = issue({ title: "Fix login crash" });
    expect(matchesQuery(i, parseQuery("fix crash"))).toBe(true);
    expect(matchesQuery(i, parseQuery("fix missing"))).toBe(false);
  });

  it("does not match words against the body", () => {
    expect(matchesQuery(issue({ body: "secretword" }), parseQuery("secretword"))).toBe(false);
  });

  it("combines filters and words", () => {
    const q = parseQuery("label:bug login");
    expect(matchesQuery(issue({ title: "Login", labels: ["bug"] }), q)).toBe(true);
    expect(matchesQuery(issue({ title: "Login", labels: ["ui"] }), q)).toBe(false);
    expect(matchesQuery(issue({ title: "Logout", labels: ["bug"] }), q)).toBe(false);
  });
});
