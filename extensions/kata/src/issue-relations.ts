import { Issue, IssueDetail, RelationKind, TitledIssueRef } from "./kata";

export interface RelationRef {
  qualified_id: string;
  status: TitledIssueRef["status"];
  title?: string;
}

export interface Relation {
  kind: RelationKind;
  ref: RelationRef;
}

export const RELATION_TITLES: Record<RelationKind, string> = {
  parent: "Parent",
  child: "Children",
  "blocked-by": "Blocked By",
  blocks: "Blocks",
  related: "Related",
};

export function groupRelations(detail: IssueDetail, titles?: ReadonlyMap<string, string>): Relation[] {
  const self = detail.issue.uid;
  const withTitle = (ref: RelationRef): RelationRef => ({ ...ref, title: ref.title ?? titles?.get(ref.qualified_id) });
  const toRef = ({ qualified_id, status }: RelationRef) => ({ qualified_id, status });

  const relations: Relation[] = [];
  if (detail.parent) relations.push({ kind: "parent", ref: withTitle(detail.parent) });
  for (const child of detail.children ?? []) relations.push({ kind: "child", ref: withTitle(child) });
  for (const link of detail.links ?? []) {
    if (link.type === "blocks") {
      if (link.from.uid === self) relations.push({ kind: "blocks", ref: withTitle(toRef(link.to)) });
      else if (link.to.uid === self) relations.push({ kind: "blocked-by", ref: withTitle(toRef(link.from)) });
    } else if (link.type === "related") {
      const other = link.from.uid === self ? link.to : link.from;
      relations.push({ kind: "related", ref: withTitle(toRef(other)) });
    }
  }
  const order = Object.keys(RELATION_TITLES);
  return relations.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function projectOf(ref: string): string {
  return ref.slice(0, ref.indexOf("#"));
}

// Issues whose parent isn't in the list (no parent, or filtered out) stay top-level so they never disappear.
export function groupByParent(issues: Issue[]): { roots: Issue[]; children: Map<string, Issue[]> } {
  const uids = new Set(issues.map((i) => i.uid));
  const roots: Issue[] = [];
  const children = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (issue.parent && uids.has(issue.parent.uid)) {
      children.set(issue.parent.uid, [...(children.get(issue.parent.uid) ?? []), issue]);
    } else {
      roots.push(issue);
    }
  }
  return { roots, children };
}
