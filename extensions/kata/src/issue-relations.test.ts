import { describe, expect, it } from "vitest";
import { Issue, IssueDetail, IssueLink, IssueRef } from "./kata";
import { groupByParent, groupRelations, projectOf } from "./issue-relations";

const ref = (id: string, status: IssueRef["status"] = "open"): IssueRef => ({
  uid: `uid-${id}`,
  short_id: id,
  project: "p",
  qualified_id: `p#${id}`,
  status,
});

const link = (type: IssueLink["type"], from: string, to: string): IssueLink => ({
  id: 1,
  type,
  from: ref(from),
  to: ref(to),
});

function detail(extra: Partial<IssueDetail> = {}): IssueDetail {
  return { issue: { uid: "uid-me" } as IssueDetail["issue"], comments: [], ...extra };
}

describe("groupRelations", () => {
  it("returns nothing when the issue has no relations", () => {
    expect(groupRelations(detail())).toEqual([]);
    expect(groupRelations(detail({ links: [] }))).toEqual([]);
  });

  it("reads parent and children from the show payload", () => {
    const result = groupRelations(
      detail({
        parent: { qualified_id: "p#par", title: "Parent", status: "open" },
        children: [{ qualified_id: "p#kid", title: "Kid", status: "closed" }],
      }),
    );
    expect(result).toEqual([
      { kind: "parent", ref: { qualified_id: "p#par", title: "Parent", status: "open" } },
      { kind: "child", ref: { qualified_id: "p#kid", title: "Kid", status: "closed" } },
    ]);
  });

  it("interprets blocks links by direction and ignores parent links", () => {
    const result = groupRelations(
      detail({
        links: [link("blocks", "me", "down"), link("blocks", "up", "me"), link("parent", "me", "par")],
      }),
    );
    expect(result.map((r) => [r.kind, r.ref.qualified_id])).toEqual([
      ["blocked-by", "p#up"],
      ["blocks", "p#down"],
    ]);
  });

  it("treats related links as symmetric", () => {
    const result = groupRelations(detail({ links: [link("related", "me", "a"), link("related", "b", "me")] }));
    expect(result.map((r) => r.ref.qualified_id)).toEqual(["p#a", "p#b"]);
  });

  it("orders groups parent, children, blocked-by, blocks, related", () => {
    const result = groupRelations(
      detail({
        links: [link("related", "me", "r"), link("blocks", "me", "bl"), link("blocks", "bb", "me")],
        children: [{ qualified_id: "p#c", title: "C", status: "open" }],
        parent: { qualified_id: "p#par", title: "P", status: "open" },
      }),
    );
    expect(result.map((r) => r.kind)).toEqual(["parent", "child", "blocked-by", "blocks", "related"]);
  });

  it("fills missing titles from the lookup without overriding existing ones", () => {
    const titles = new Map([
      ["p#up", "Upstream"],
      ["p#par", "Ignored"],
    ]);
    const result = groupRelations(
      detail({
        parent: { qualified_id: "p#par", title: "Parent", status: "open" },
        links: [link("blocks", "up", "me"), link("blocks", "me", "unknown")],
      }),
      titles,
    );
    expect(result.map((r) => r.ref.title)).toEqual(["Parent", "Upstream", undefined]);
  });
});

describe("projectOf", () => {
  it.each([
    ["kata#abc4", "kata"],
    ["wanver-shop#x1y2", "wanver-shop"],
  ])("extracts the project from %s", (ref, project) => {
    expect(projectOf(ref)).toBe(project);
  });
});

describe("groupByParent", () => {
  const issue = (id: string, parent?: string) =>
    ({ uid: `uid-${id}`, qualified_id: `p#${id}`, parent: parent ? ref(parent) : undefined }) as Issue;

  it("keeps parentless issues as roots and nests children under their parent", () => {
    const { roots, children } = groupByParent([issue("a"), issue("b", "a"), issue("c", "a"), issue("d")]);
    expect(roots.map((i) => i.qualified_id)).toEqual(["p#a", "p#d"]);
    expect(children.get("uid-a")?.map((i) => i.qualified_id)).toEqual(["p#b", "p#c"]);
  });

  it("keeps a child top-level when its parent is not in the list", () => {
    const { roots, children } = groupByParent([issue("b", "missing")]);
    expect(roots.map((i) => i.qualified_id)).toEqual(["p#b"]);
    expect(children.size).toBe(0);
  });
});
