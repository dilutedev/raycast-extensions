import { Connection, getActiveConnection } from "./connections";

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
  uid: string;
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

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  connection?: Connection;
}

const EVIDENCE_TYPES = [
  "commit",
  "pr",
  "test",
  "reviewed-paths",
  "external",
  "no-change-audit",
  "duplicate-of",
  "superseded-by",
  "attachment",
];

const EVIDENCE_VALUE_FIELDS: Record<string, string> = {
  commit: "sha",
  pr: "url",
  test: "command",
  external: "account",
  "no-change-audit": "rationale",
  "duplicate-of": "issue_ref",
  "superseded-by": "issue_ref",
  attachment: "attachment_id",
};

export interface Evidence {
  type: string;
  sha?: string;
  url?: string;
  command?: string;
  paths?: string[];
  account?: string;
  rationale?: string;
  issue_ref?: string;
  attachment_id?: string;
}

export function encodeBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

export function parseEvidence(text: string): Evidence[] {
  const entries: string[] = [];
  for (const segment of text.split(/[,\n]/)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf(":");
    const startsNewEntry = separatorIndex > 0 && EVIDENCE_TYPES.includes(trimmed.slice(0, separatorIndex));
    if (startsNewEntry || entries.length === 0) entries.push(trimmed);
    else entries[entries.length - 1] += `,${trimmed}`;
  }
  return entries.map((entry) => {
    const separatorIndex = entry.indexOf(":");
    const type = separatorIndex > 0 ? entry.slice(0, separatorIndex) : "";
    const value = entry.slice(separatorIndex + 1).trim();
    if (!EVIDENCE_TYPES.includes(type) || !value) {
      throw new Error(`Invalid evidence "${entry}". Use type:value with one of ${EVIDENCE_TYPES.join(", ")}.`);
    }
    if (type === "reviewed-paths") return { type, paths: [value] };
    return { type, [EVIDENCE_VALUE_FIELDS[type]]: value };
  });
}

export function splitRef(ref: string): { project: string; shortId: string } {
  const separatorIndex = ref.lastIndexOf("#");
  if (separatorIndex <= 0) throw new Error(`Invalid issue reference "${ref}". Expected <project>#<id>.`);
  return { project: ref.slice(0, separatorIndex), shortId: ref.slice(separatorIndex + 1) };
}

async function resolveConnection(connection?: Connection): Promise<Connection> {
  const resolved = connection ?? (await getActiveConnection());
  if (!resolved) throw new Error("No kata connection is configured. Add one with the Manage Connections command.");
  return resolved;
}

async function actorField(connection?: Connection): Promise<{ actor?: string }> {
  const { actor } = await resolveConnection(connection);
  return actor ? { actor } : {};
}

export async function request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { name, serverUrl, authToken } = await resolveConnection(options.connection);
  const url = new URL(`${serverUrl}/api/v1${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      `The kata server at ${serverUrl} (connection "${name}") is unreachable. Check its URL in Manage Connections and that Tailscale is connected.`,
    );
  }
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(`Kata rejected the auth token for connection "${name}" — check it in Manage Connections`);
    }
    const message = (payload as { error?: { message?: string } } | undefined)?.error?.message;
    throw new Error(message || `HTTP ${response.status} ${response.statusText}`);
  }
  return payload as T;
}

const projectsPromises = new Map<string, Promise<Project[]>>();

export async function listProjects(connection?: Connection): Promise<Project[]> {
  const resolved = await resolveConnection(connection);
  const cacheKey = `${resolved.id}:${resolved.serverUrl}`;
  let pending = projectsPromises.get(cacheKey);
  if (!pending) {
    pending = request<{ projects: Project[] }>("GET", "/projects", { connection: resolved }).then(
      (res) => res.projects,
      (error) => {
        projectsPromises.delete(cacheKey);
        throw error;
      },
    );
    projectsPromises.set(cacheKey, pending);
  }
  return pending;
}

async function projectByName(name: string, connection?: Connection): Promise<Project> {
  const project = (await listProjects(connection)).find((candidate) => candidate.name === name);
  if (!project) throw new Error(`Unknown kata project "${name}"`);
  return project;
}

async function projectId(name: string, connection?: Connection): Promise<number> {
  return (await projectByName(name, connection)).id;
}

async function issuePath(ref: string): Promise<string> {
  const { project, shortId } = splitRef(ref);
  return `/projects/${await projectId(project)}/issues/${encodeURIComponent(shortId)}`;
}

function relationTarget(sourceProject: string, target: string): string {
  const destination = splitRef(target);
  return destination.project === sourceProject ? destination.shortId : target;
}

export async function testConnection(connection: Connection): Promise<void> {
  await request("GET", "/health", { connection });
  await request("GET", "/projects", { connection });
}

export async function listIssues(status: "open" | "closed" | "all"): Promise<Issue[]> {
  const res = await request<{ issues: Issue[] }>("GET", "/issues", {
    query: { status: status === "all" ? undefined : status },
  });
  return res.issues;
}

export async function listProjectIssues(project: string, connection?: Connection): Promise<Issue[]> {
  const res = await request<{ issues: Issue[] }>("GET", `/projects/${await projectId(project, connection)}/issues`, {
    query: { status: "open" },
    connection,
  });
  return res.issues;
}

export async function showIssue(ref: string): Promise<IssueDetail> {
  return request<IssueDetail>("GET", await issuePath(ref));
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

export async function createIssue(issue: NewIssue, connection?: Connection) {
  const links = [
    ...(issue.parent ? [{ to_ref: relationTarget(issue.project, issue.parent), type: "parent" }] : []),
    ...issue.blockedBy.map((blocker) => ({
      to_ref: relationTarget(issue.project, blocker),
      type: "blocks",
      incoming: true,
    })),
  ];
  return request<{ issue: Pick<Issue, "uid">; web_url?: string }>(
    "POST",
    `/projects/${await projectId(issue.project, connection)}/issues`,
    {
      connection,
      body: {
        ...(await actorField(connection)),
        title: issue.title,
        body: issue.body,
        ...(issue.priority ? { priority: Number(issue.priority) } : {}),
        ...(issue.labels.length ? { labels: issue.labels } : {}),
        ...(issue.owner ? { owner: issue.owner } : {}),
        ...(links.length ? { links } : {}),
      },
    },
  );
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
  qualified_id: string;
  title: string;
  from?: string;
  message?: string;
}

export type AdminItem = Record<string, unknown>;

export type AdminView = "cron-jobs" | "cron-runs" | "cron-workflows" | "teams" | "tokens";

async function claimBody() {
  return { ...(await actorField()), force: false, if_unowned: false };
}

export async function claimIssue(ref: string) {
  return request("POST", `${await issuePath(ref)}/actions/claim`, { body: await claimBody() });
}

export async function commentIssue(ref: string, body: string) {
  return request("POST", `${await issuePath(ref)}/comments`, { body: { ...(await actorField()), body } });
}

export async function closeIssue(ref: string, reason: string, message: string, evidence: string) {
  const parsedEvidence = parseEvidence(evidence);
  return request("POST", `${await issuePath(ref)}/actions/close`, {
    body: {
      ...(await actorField()),
      dry_run: false,
      ...(parsedEvidence.length ? { evidence: parsedEvidence } : {}),
      message,
      reason,
    },
  });
}

export async function reopenIssue(ref: string) {
  return request("POST", `${await issuePath(ref)}/actions/reopen`, { body: await actorField() });
}

export async function editIssue(ref: string, changes: { title?: string; body?: string }) {
  return request("PATCH", await issuePath(ref), { body: { ...(await actorField()), ...changes } });
}

export async function setIssuePriority(ref: string, priority: number | undefined) {
  const change = priority === undefined ? { clear_priority: true } : { set_priority: priority };
  return request("PATCH", await issuePath(ref), { body: { ...(await actorField()), ...change } });
}

const RELATION_DELTA_KEYS: Record<EditableRelationKind, { add: string; remove: string; single: boolean }> = {
  parent: { add: "set_parent", remove: "remove_parent", single: true },
  "blocked-by": { add: "add_blocked_by", remove: "remove_blocked_by", single: false },
  blocks: { add: "add_blocks", remove: "remove_blocks", single: false },
  related: { add: "add_related", remove: "remove_related", single: false },
};

async function editRelation(ref: string, kind: EditableRelationKind, target: string, remove: boolean) {
  const keys = RELATION_DELTA_KEYS[kind];
  const targetRef = relationTarget(splitRef(ref).project, target);
  const key = remove ? keys.remove : keys.add;
  const value = keys.single ? targetRef : [targetRef];
  return request("PATCH", await issuePath(ref), { body: { ...(await actorField()), links_delta: { [key]: value } } });
}

export function addIssueRelation(ref: string, kind: EditableRelationKind, target: string) {
  return editRelation(ref, kind, target, false);
}

export function removeIssueRelation(ref: string, kind: EditableRelationKind, target: string) {
  return editRelation(ref, kind, target, true);
}

export async function assignIssue(ref: string, owner: string) {
  return request("POST", `${await issuePath(ref)}/actions/assign`, { body: { ...(await actorField()), owner } });
}

export async function unassignIssue(ref: string) {
  return request("POST", `${await issuePath(ref)}/actions/unassign`, { body: await actorField() });
}

export async function addIssueLabel(ref: string, label: string) {
  return request("POST", `${await issuePath(ref)}/labels`, { body: { ...(await actorField()), label } });
}

export async function removeIssueLabel(ref: string, label: string) {
  return request("DELETE", `${await issuePath(ref)}/labels/${encodeURIComponent(label)}`, {
    query: await actorField(),
  });
}

async function patchMetadata(ref: string, patch: Record<string, unknown>) {
  return request("POST", `${await issuePath(ref)}/metadata`, { body: { ...(await actorField()), patch } });
}

export async function listReadyIssues(): Promise<Issue[]> {
  const res = await request<{ issues: Issue[] }>("GET", "/ready");
  return res.issues;
}

export async function nextIssue(): Promise<Issue | null> {
  const res = await request<{ issues: Issue[] }>("GET", "/ready", { query: { limit: 1, sort: "priority" } });
  return res.issues[0] ?? null;
}

export async function showPlanningDates(ref: string): Promise<PlanningDates> {
  return request<PlanningDates>("GET", `${await issuePath(ref)}/planning-dates`);
}

export function setIssueDeadline(ref: string, date: string | undefined) {
  return patchMetadata(ref, { deadline_on: date ?? null });
}

export function setIssueSchedule(ref: string, date: string | undefined) {
  return patchMetadata(ref, { scheduled_on: date ?? null });
}

export function setIssueAttention(ref: string, attention: Attention, message: string) {
  return patchMetadata(ref, { "work.attention": attention, ...(message ? { "work.attention_msg": message } : {}) });
}

export async function notifyIssue(ref: string, to: string, message: string) {
  const { actor } = await actorField();
  return patchMetadata(ref, { [`notify.${encodeBase64Url(to)}`]: { ...(actor ? { from: actor } : {}), message } });
}

export function clearIssueRequest(ref: string, to: string) {
  return patchMetadata(ref, { [`notify.${encodeBase64Url(to)}`]: null });
}

export async function moveIssue(ref: string, project: string, single: boolean) {
  const targetProject = await projectByName(project);
  return request("POST", `${await issuePath(ref)}/actions/move`, {
    body: { ...(await actorField()), ...(single ? { single: true } : {}), to_project_uid: targetProject.uid },
  });
}

export async function deleteIssue(ref: string) {
  const actor = (await actorField()).actor ?? (await instanceActor());
  return request("POST", `${await issuePath(ref)}/actions/delete`, { body: actor ? { actor } : {} });
}

export async function restoreIssue(ref: string) {
  return request("POST", `${await issuePath(ref)}/actions/restore`, { body: await actorField() });
}

export async function searchIssues(
  query: string,
  project: string,
  status: "open" | "closed" | "all",
  includeDeleted: boolean,
): Promise<SearchResult[]> {
  const res = await request<{ results: SearchResult[] }>("GET", `/projects/${await projectId(project)}/search`, {
    query: {
      q: query,
      limit: 50,
      status: status === "all" ? undefined : status,
      include_deleted: includeDeleted,
    },
  });
  return res.results;
}

interface InstanceInfo {
  version: string;
  auth: { kind: string; actor?: string };
}

async function instanceActor(): Promise<string | undefined> {
  const instance = await request<InstanceInfo>("GET", "/instance");
  return instance.auth?.actor || undefined;
}

export async function currentActor(): Promise<string | undefined> {
  return (await instanceActor()) ?? (await actorField()).actor;
}

export async function listInbox(actor: string): Promise<InboxRequest[]> {
  const metadataKey = `notify.${encodeBase64Url(actor)}`;
  const res = await request<{ issues: Issue[] }>("GET", "/issues", {
    query: { limit: 0, status: "open", meta: metadataKey },
  });
  return res.issues.map((issue) => {
    const notification = issue.metadata?.[metadataKey] as { from?: string; message?: string } | undefined;
    return {
      qualified_id: issue.qualified_id,
      title: issue.title,
      from: notification?.from,
      message: notification?.message,
    };
  });
}

function windowStartTimestamp(window: string, now: Date): string {
  const match = /^(\d+)([hd])$/.exec(window);
  if (!match) throw new Error(`Invalid digest window "${window}"`);
  const hours = Number(match[1]) * (match[2] === "d" ? 24 : 1);
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export function showDigest(since: string, projectId: number | undefined): Promise<Digest> {
  const path = projectId === undefined ? "/digest" : `/projects/${projectId}/digest`;
  const now = new Date();
  return request<Digest>("GET", path, {
    query: { since: windowStartTimestamp(since, now), until: now.toISOString() },
  });
}

export async function listRecentCloses(project: string, since: string): Promise<CloseRow[]> {
  const res = await request<{ rows: CloseRow[] }>("GET", "/audit/closes", {
    query: { project_id: await projectId(project), since },
  });
  return res.rows;
}

export async function listLabelCounts(project: string): Promise<LabelCount[]> {
  const res = await request<{ labels: LabelCount[] }>("GET", `/projects/${await projectId(project)}/labels`);
  return res.labels;
}

export function healthCheck() {
  return request<AdminItem>("GET", "/health");
}

export async function whoAmI() {
  const [connection, instance] = await Promise.all([resolveConnection(), request<AdminItem>("GET", "/instance")]);
  return { connection: connection.name, server_url: connection.serverUrl, ...instance };
}

export async function listAdminItems(view: AdminView, project: string): Promise<AdminItem[]> {
  if (view === "teams" || view === "tokens") {
    const res = await request<Record<string, AdminItem[]>>("GET", `/${view}`);
    return res[view] ?? [];
  }
  const resource = view.replace("cron-", "");
  const query: Record<string, QueryValue> = resource === "runs" ? { limit: 100 } : { include_deleted: false };
  const res = await request<Record<string, AdminItem[]>>(
    "GET",
    `/projects/${await projectId(project)}/cron/${resource}`,
    {
      query,
    },
  );
  return res[resource] ?? [];
}
