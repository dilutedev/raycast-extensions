import { execFile } from "child_process";
import { getPreferenceValues } from "@raycast/api";

export interface Issue {
  uid: string;
  short_id: string;
  qualified_id: string;
  project_name: string;
  title: string;
  body: string;
  status: "open" | "closed";
  closed_reason?: string;
  owner?: string;
  priority?: number;
  labels?: string[];
  blocked?: boolean;
  parent?: IssueRef;
  metadata?: Record<string, unknown>;
  deleted_at?: string;
  web_url: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
}

export interface IssueRef {
  uid: string;
  short_id: string;
  project: string;
  qualified_id: string;
  status: Issue["status"];
}

export interface IssueLink {
  id: number;
  from: IssueRef;
  to: IssueRef;
  type: "parent" | "blocks" | "related";
}

export interface TitledIssueRef {
  qualified_id: string;
  title: string;
  status: Issue["status"];
}

export interface IssueDetail {
  web_url?: string;
  issue: Issue;
  comments: Comment[];
  links?: IssueLink[];
  parent?: TitledIssueRef;
  children?: TitledIssueRef[];
}

export type RelationKind = "parent" | "child" | "blocked-by" | "blocks" | "related";
export type EditableRelationKind = Exclude<RelationKind, "child">;

export function kata<T = unknown>(args: string[], stdin?: string): Promise<T> {
  const { kataPath, serverUrl, authToken, actor } = getPreferenceValues<Preferences>();
  const remoteEnv: Record<string, string> = {};
  if (serverUrl) remoteEnv.KATA_SERVER = serverUrl;
  if (authToken) remoteEnv.KATA_AUTH_TOKEN = authToken;
  if (actor) remoteEnv.KATA_AUTHOR = actor;
  return new Promise((resolve, reject) => {
    const child = execFile(
      kataPath || "kata",
      [...args, "--json"],
      {
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...remoteEnv, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
      },
      (error, stdout, stderr) => {
        if (error) {
          // kata reports failures as {"error":{"message":...}} on stdout
          try {
            reject(new Error(JSON.parse(stdout).error.message));
          } catch {
            reject(new Error(stderr.trim() || error.message));
          }
          return;
        }
        resolve(JSON.parse(stdout) as T);
      },
    );
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

export async function listIssues(status: "open" | "closed" | "all"): Promise<Issue[]> {
  const res = await kata<{ issues: Issue[] }>(["list", "--all", "--status", status, "--limit", "0"]);
  return res.issues;
}

export async function listProjectIssues(project: string): Promise<Issue[]> {
  const res = await kata<{ issues: Issue[] }>(["list", "--project", project, "--status", "open", "--limit", "0"]);
  return res.issues;
}

export async function listProjects(): Promise<Project[]> {
  const res = await kata<{ projects: Project[] }>(["projects", "list"]);
  return res.projects;
}

export function showIssue(ref: string): Promise<IssueDetail> {
  return kata<IssueDetail>(["show", ref]);
}

export interface NewIssue {
  project: string;
  title: string;
  body: string;
  priority: string;
  labels: string[];
  owner: string;
  parent: string;
  blockedBy: string[];
}

export function createIssue(issue: NewIssue) {
  const args = ["create", issue.title, "--project", issue.project, "--body-stdin"];
  if (issue.priority) args.push("--priority", issue.priority);
  for (const label of issue.labels) args.push("--label", label);
  if (issue.owner) args.push("--owner", issue.owner);
  if (issue.parent) args.push("--parent", issue.parent);
  for (const ref of issue.blockedBy) args.push("--blocked-by", ref);
  return kata<{ issue: Pick<Issue, "uid"> }>(args, issue.body);
}

export function claimIssue(ref: string) {
  return kata(["claim", ref]);
}

export function commentIssue(ref: string, body: string) {
  return kata(["comment", ref, "--body-stdin"], body);
}

export function closeIssue(ref: string, reason: string, message: string, evidence: string) {
  const args = ["close", ref, "--reason", reason, "--message", message];
  if (evidence) args.push("--evidence", evidence);
  return kata(args);
}

export function reopenIssue(ref: string) {
  return kata(["reopen", ref]);
}

export function editIssue(ref: string, changes: { title?: string; body?: string }) {
  const args = ["edit", ref];
  if (changes.title !== undefined) args.push(`--title=${changes.title}`);
  if (changes.body !== undefined) args.push(`--body=${changes.body}`);
  return kata(args);
}

export function setIssuePriority(ref: string, priority: number | undefined) {
  return kata(["edit", ref, `--priority=${priority ?? "-"}`]);
}

function editRelation(ref: string, kind: EditableRelationKind, target: string, remove: boolean) {
  return kata(["edit", ref, `--${remove ? "remove-" : ""}${kind}=${target}`]);
}

export function addIssueRelation(ref: string, kind: EditableRelationKind, target: string) {
  return editRelation(ref, kind, target, false);
}

export function removeIssueRelation(ref: string, kind: EditableRelationKind, target: string) {
  return editRelation(ref, kind, target, true);
}

export function assignIssue(ref: string, owner: string) {
  return kata(["assign", ref, owner]);
}

export function unassignIssue(ref: string) {
  return kata(["unassign", ref]);
}

export function addIssueLabel(ref: string, label: string) {
  return kata(["label", "add", ref, label]);
}

export function removeIssueLabel(ref: string, label: string) {
  return kata(["label", "rm", ref, label]);
}

export interface PlanningDates {
  scheduled_on: string | null;
  deadline_on: string | null;
}

export type Attention = "ok" | "needs-human" | "stuck";

export interface SearchResult {
  web_url: string;
  issue: Issue;
  matched_in?: string[];
}

export interface DigestTotals {
  created: number;
  closed: number;
  reopened: number;
  commented: number;
  edited: number;
  assigned: number;
  unassigned: number;
  priority_set: number;
  priority_cleared: number;
  labeled: number;
  unlabeled: number;
  linked: number;
  unlinked: number;
  unblocked: number;
  deleted: number;
  restored: number;
  other: number;
}

export interface DigestActor {
  actor: string;
  totals: DigestTotals;
  issues?: { project_name: string; issue_short_id: string; actions: string[] }[];
}

export interface Digest {
  event_count: number;
  totals: DigestTotals;
  actors: DigestActor[];
}

export interface CloseRow {
  time: string;
  actor: string;
  issue: string;
  reason: string;
  message?: string;
  event_id: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface InboxRequest {
  qualified_id?: string;
  issue?: string;
  project?: string;
  project_name?: string;
  short_id?: string;
  issue_short_id?: string;
  title?: string;
  message?: string;
  from?: string;
  sender?: string;
  author?: string;
  created_at?: string;
}

export type AdminItem = Record<string, unknown>;

export type AdminView = "cron-jobs" | "cron-runs" | "cron-workflows" | "teams" | "tokens";

export async function listReadyIssues(): Promise<Issue[]> {
  const res = await kata<{ issues: Issue[] }>(["ready", "--all", "--limit", "0"]);
  return res.issues;
}

export async function nextIssue(): Promise<Issue | null> {
  const res = await kata<{ issue: Issue | null }>(["next", "--all"]);
  return res.issue;
}

export function showPlanningDates(ref: string): Promise<PlanningDates> {
  return kata<PlanningDates>(["show", ref, "--planning-dates"]);
}

export function setIssueDeadline(ref: string, date: string | undefined) {
  return kata(["deadline", ref, date ?? "-"]);
}

export function setIssueSchedule(ref: string, date: string | undefined) {
  return kata(["schedule", ref, date ?? "-"]);
}

export async function setIssueAttention(ref: string, attention: Attention, message: string) {
  await kata(["meta", "set", ref, "work.attention", attention]);
  if (message) await kata(["meta", "set", ref, "work.attention_msg", message]);
}

export function notifyIssue(ref: string, to: string, message: string) {
  return kata(["notify", ref, "--to", to, "--message", message]);
}

export function clearIssueRequest(ref: string, to: string) {
  return kata(["notify", ref, "--to", to, "--clear"]);
}

export function moveIssue(ref: string, project: string, single: boolean) {
  const args = ["move", ref, project];
  if (single) args.push("--single");
  return kata(args);
}

export function deleteIssue(ref: string) {
  return kata(["delete", ref, "--force", "--confirm", `DELETE ${ref}`]);
}

export function restoreIssue(ref: string) {
  return kata(["restore", ref]);
}

export async function searchIssues(
  query: string,
  project: string,
  status: "open" | "closed" | "all",
  includeDeleted: boolean,
): Promise<SearchResult[]> {
  const args = ["search", query, "--project", project, "--limit", "50"];
  if (status !== "all") args.push("--status", status);
  if (includeDeleted) args.push("--include-deleted");
  const res = await kata<{ results: SearchResult[] }>(args);
  return res.results;
}

export async function currentActor(): Promise<string> {
  const res = await kata<{ actor: string }>(["whoami"]);
  return res.actor;
}

export async function listInbox(actor: string): Promise<InboxRequest[]> {
  const res = await kata<{ requests: InboxRequest[] }>(["inbox", "--for", actor, "--all"]);
  return res.requests;
}

export function showDigest(since: string, projectId: number | undefined): Promise<Digest> {
  const scope = projectId === undefined ? ["--all"] : ["--project-id", String(projectId)];
  return kata<Digest>(["digest", ...scope, "--since", since]);
}

export async function listRecentCloses(project: string, since: string): Promise<CloseRow[]> {
  const res = await kata<{ rows: CloseRow[] }>(["audit", "closes", "--project", project, "--since", since]);
  return res.rows;
}

export async function listLabelCounts(project: string): Promise<LabelCount[]> {
  const res = await kata<{ labels: LabelCount[] }>(["labels", "--project", project]);
  return res.labels;
}

export function healthCheck() {
  return kata<AdminItem>(["health"]);
}

export function whoAmI() {
  return kata<AdminItem>(["whoami"]);
}

export async function listAdminItems(view: AdminView, project: string): Promise<AdminItem[]> {
  const commands: Record<AdminView, { args: string[]; key: string }> = {
    "cron-jobs": { args: ["cron", "job", "list", "--project", project], key: "jobs" },
    "cron-runs": { args: ["cron", "run", "list", "--project", project], key: "runs" },
    "cron-workflows": { args: ["cron", "workflow", "list", "--project", project], key: "workflows" },
    teams: { args: ["teams", "list"], key: "teams" },
    tokens: { args: ["tokens", "list"], key: "tokens" },
  };
  const { args, key } = commands[view];
  const res = await kata<Record<string, AdminItem[]>>(args);
  return res[key] ?? [];
}
