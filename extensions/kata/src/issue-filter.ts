import { Issue } from "./kata";

export interface Query {
  words: string[];
  labels: string[];
  owner?: string;
  unowned: boolean;
  priority?: { op: "eq" | "le"; n: number };
  ready: boolean;
}

export function parseQuery(text: string): Query {
  const query: Query = { words: [], labels: [], unowned: false, ready: false };
  for (const word of text.trim().split(/\s+/)) {
    if (word === "") continue;
    let m: RegExpMatchArray | null;
    if (/^(label|owner|p|is):$/i.test(word)) continue;
    if ((m = word.match(/^label:(.+)$/i))) query.labels.push(m[1].toLowerCase());
    else if (/^owner:none$/i.test(word)) query.unowned = true;
    else if ((m = word.match(/^owner:(.+)$/i))) query.owner = m[1].toLowerCase();
    else if ((m = word.match(/^p:([0-4])$/i))) query.priority = { op: "eq", n: Number(m[1]) };
    else if ((m = word.match(/^p:<=([0-4])$/i))) query.priority = { op: "le", n: Number(m[1]) };
    else if (/^is:ready$/i.test(word)) query.ready = true;
    else query.words.push(word.toLowerCase());
  }
  return query;
}

export function matchesQuery(issue: Issue, q: Query): boolean {
  if (q.ready && !(issue.status === "open" && !issue.blocked)) return false;
  for (const l of q.labels) {
    if (!issue.labels?.some((x) => x.toLowerCase() === l)) return false;
  }
  if (q.unowned && issue.owner) return false;
  if (q.owner && issue.owner?.toLowerCase() !== q.owner) return false;
  if (q.priority) {
    if (issue.priority === undefined) return false;
    if (q.priority.op === "eq" ? issue.priority !== q.priority.n : issue.priority > q.priority.n) return false;
  }
  if (q.words.length === 0) return true;
  const haystack = [
    issue.title,
    issue.short_id,
    issue.qualified_id,
    issue.project_name,
    issue.owner ?? "",
    ...(issue.labels ?? []),
    issue.priority !== undefined ? `P${issue.priority}` : "",
  ]
    .join("\n")
    .toLowerCase();
  return q.words.every((w) => haystack.includes(w));
}
