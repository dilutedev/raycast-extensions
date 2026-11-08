import { beforeEach, describe, expect, it, vi } from "vitest";
import { Connection } from "./connections";
import {
  addIssueRelation,
  clearIssueRequest,
  closeIssue,
  createIssue,
  currentActor,
  deleteIssue,
  editIssue,
  encodeBase64Url,
  listInbox,
  listIssues,
  listProjects,
  moveIssue,
  nextIssue,
  notifyIssue,
  parseEvidence,
  removeIssueLabel,
  removeIssueRelation,
  request,
  searchIssues,
  setIssueAttention,
  setIssueDeadline,
  setIssuePriority,
  showDigest,
  showIssue,
  splitRef,
  testConnection,
} from "./kata";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("@raycast/api", () => ({
  LocalStorage: {
    getItem: vi.fn(async (key: string) => storage.get(key)),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  },
}));

const SERVER = "http://100.1.2.3:7777";
const projects = [
  { id: 22, uid: "UID22", name: "p" },
  { id: 23, uid: "UID23", name: "q" },
];

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}) {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, statusText: init.statusText });
}

function stubFetch(handler: (url: URL, init: RequestInit) => unknown = () => ({})) {
  fetchMock.mockImplementation(async (url: URL, init: RequestInit) => {
    if (url.pathname === "/api/v1/projects") return jsonResponse({ projects });
    const result = handler(url, init);
    return result instanceof Response ? result : jsonResponse(result);
  });
}

function sentCalls() {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ url: url as URL, init: init as RequestInit }))
    .filter(({ url }) => url.pathname !== "/api/v1/projects");
}

function lastCall() {
  const calls = sentCalls();
  const { url, init } = calls[calls.length - 1];
  return {
    method: init.method,
    path: url.pathname + url.search,
    headers: init.headers as Record<string, string>,
    body: init.body === undefined ? undefined : JSON.parse(init.body as string),
  };
}

function setConnection(overrides: Partial<Connection> = {}) {
  const connection: Connection = {
    id: "conn-1",
    name: "Personal",
    serverUrl: SERVER,
    authToken: "secret",
    actor: "andy",
    ...overrides,
  };
  storage.set("connections", JSON.stringify([connection]));
  storage.set("activeConnectionId", connection.id);
  return connection;
}

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  storage.clear();
  setConnection();
  stubFetch();
  await listProjects().catch(() => undefined);
});

describe("pure helpers", () => {
  it.each([
    ["someone", "c29tZW9uZQ"],
    ["dilutedev", "ZGlsdXRlZGV2"],
  ])("encodeBase64Url(%s)", (text, expected) => {
    expect(encodeBase64Url(text)).toBe(expected);
  });

  it("splitRef splits on the last hash", () => {
    expect(splitRef("wup-be#fb5j")).toEqual({ project: "wup-be", shortId: "fb5j" });
    expect(() => splitRef("fb5j")).toThrow("Invalid issue reference");
  });

  describe("parseEvidence", () => {
    it("maps each typed entry to its API field", () => {
      expect(
        parseEvidence(
          "commit:abc, pr:https://x/1, test:go test ./..., reviewed-paths:src/a.go, external:acme, no-change-audit:nothing to do, duplicate-of:p#d4ex, superseded-by:p#e5fx, attachment:att1",
        ),
      ).toEqual([
        { type: "commit", sha: "abc" },
        { type: "pr", url: "https://x/1" },
        { type: "test", command: "go test ./..." },
        { type: "reviewed-paths", paths: ["src/a.go"] },
        { type: "external", account: "acme" },
        { type: "no-change-audit", rationale: "nothing to do" },
        { type: "duplicate-of", issue_ref: "p#d4ex" },
        { type: "superseded-by", issue_ref: "p#e5fx" },
        { type: "attachment", attachment_id: "att1" },
      ]);
    });

    it("accepts newline separators and keeps commas inside a value", () => {
      expect(parseEvidence("test:a, b\ncommit:abc")).toEqual([
        { type: "test", command: "a,b" },
        { type: "commit", sha: "abc" },
      ]);
    });

    it("returns nothing for blank text", () => {
      expect(parseEvidence("  ")).toEqual([]);
    });

    it.each(["bogus:x", "justtext", "commit:"])("rejects %s", (text) => {
      expect(() => parseEvidence(text)).toThrow("Invalid evidence");
    });
  });
});

describe("request()", () => {
  it("uses the active connection URL and token", async () => {
    setConnection({ authToken: "tok" });
    stubFetch(() => ({ a: 1 }));
    await expect(request("GET", "/thing", { query: { x: 1, skipped: undefined } })).resolves.toEqual({ a: 1 });
    expect(lastCall()).toEqual({
      method: "GET",
      path: "/api/v1/thing?x=1",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: undefined,
    });
    expect((fetchMock.mock.calls.at(-1)?.[0] as URL).origin).toBe(SERVER);
  });

  it("sends no Authorization header when the connection has no token", async () => {
    setConnection({ authToken: undefined });
    stubFetch();
    await request("GET", "/thing");
    expect(lastCall().headers).toEqual({ "Content-Type": "application/json" });
  });

  it("lets an explicit connection override the active one", async () => {
    stubFetch();
    const other: Connection = { id: "conn-2", name: "Team", serverUrl: "http://10.0.0.9:7777", authToken: "teamtoken" };
    await request("GET", "/thing", { connection: other });
    const [url, init] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
    expect(url.origin).toBe("http://10.0.0.9:7777");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer teamtoken");
  });

  it("follows the active connection when it changes", async () => {
    setConnection({ id: "conn-3", serverUrl: "http://10.0.0.3:7777" });
    await request("GET", "/thing");
    expect((fetchMock.mock.calls.at(-1)?.[0] as URL).origin).toBe("http://10.0.0.3:7777");
  });

  it("fails clearly when no connection exists", async () => {
    storage.clear();
    await expect(request("GET", "/thing")).rejects.toThrow("Manage Connections");
  });

  it("caches projects per connection", async () => {
    storage.clear();
    const first: Connection = { id: "a", name: "A", serverUrl: "http://a:1", authToken: "ta" };
    const second: Connection = { id: "b", name: "B", serverUrl: "http://b:1", authToken: "tb" };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: URL) =>
      jsonResponse({ projects: [{ id: url.origin === "http://a:1" ? 1 : 2, uid: "u", name: "x" }] }),
    );
    expect((await listProjects(first))[0].id).toBe(1);
    expect((await listProjects(second))[0].id).toBe(2);
    expect((await listProjects(first))[0].id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tests a connection with health and then an authenticated projects call", async () => {
    stubFetch();
    const candidate: Connection = { id: "t", name: "T", serverUrl: "http://t:1", authToken: "ttoken" };
    fetchMock.mockClear();
    await testConnection(candidate);
    const urls = fetchMock.mock.calls.map(([url]) => (url as URL).pathname);
    expect(urls).toEqual(["/api/v1/health", "/api/v1/projects"]);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer ttoken" });
  });

  it("maps 401 to an auth token message", async () => {
    stubFetch(() => jsonResponse({ error: { message: "nope" } }, { status: 401 }));
    await expect(request("GET", "/x")).rejects.toThrow(
      'Kata rejected the auth token for connection "Personal" — check it in Manage Connections',
    );
  });

  it("throws the error envelope message", async () => {
    stubFetch(() => jsonResponse({ error: { message: "boom" } }, { status: 400 }));
    await expect(request("GET", "/x")).rejects.toThrow("boom");
  });

  it("falls back to the HTTP status", async () => {
    stubFetch(() => new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    await expect(request("GET", "/x")).rejects.toThrow("HTTP 502 Bad Gateway");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(request("GET", "/x")).rejects.toThrow(
      `The kata server at ${SERVER} (connection "Personal") is unreachable`,
    );
    await expect(request("GET", "/x")).rejects.toThrow("Tailscale");
  });
});

describe("wrappers", () => {
  it.each([
    ["open", "/api/v1/issues?status=open"],
    ["closed", "/api/v1/issues?status=closed"],
    ["all", "/api/v1/issues"],
  ] as const)("listIssues(%s)", async (status, path) => {
    stubFetch(() => ({ issues: [] }));
    await expect(listIssues(status)).resolves.toEqual([]);
    expect(lastCall()).toMatchObject({ method: "GET", path });
  });

  it("showIssue resolves the project id and uses the short id", async () => {
    await showIssue("p#fb5j");
    expect(lastCall()).toMatchObject({ method: "GET", path: "/api/v1/projects/22/issues/fb5j" });
  });

  it("createIssue sends parent and blocked-by links", async () => {
    await createIssue({
      project: "p",
      title: "T",
      body: "B",
      priority: "2",
      labels: ["x"],
      owner: "y",
      parent: "p#fb5j",
      blockedBy: ["p#hsz5"],
    });
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: "/api/v1/projects/22/issues",
      body: {
        actor: "andy",
        body: "B",
        labels: ["x"],
        links: [
          { to_ref: "fb5j", type: "parent" },
          { incoming: true, to_ref: "hsz5", type: "blocks" },
        ],
        owner: "y",
        priority: 2,
        title: "T",
      },
    });
  });

  it("createIssue omits optional fields and the actor when unset", async () => {
    setConnection({ actor: undefined });
    await createIssue({
      project: "p",
      title: "T",
      body: "",
      priority: "",
      labels: [],
      owner: "",
      parent: "",
      blockedBy: [],
    });
    expect(lastCall().body).toEqual({ title: "T", body: "" });
  });

  it("editIssue patches the title and body", async () => {
    await editIssue("p#fb5j", { title: "T", body: "B" });
    expect(lastCall()).toMatchObject({
      method: "PATCH",
      path: "/api/v1/projects/22/issues/fb5j",
      body: { actor: "andy", title: "T", body: "B" },
    });
  });

  it.each([
    [1, { set_priority: 1 }],
    [0, { set_priority: 0 }],
    [undefined, { clear_priority: true }],
  ])("setIssuePriority(%s)", async (priority, expected) => {
    await setIssuePriority("p#fb5j", priority);
    expect(lastCall().body).toEqual({ actor: "andy", ...expected });
  });

  it.each([
    ["parent", { set_parent: "hsz5" }],
    ["blocked-by", { add_blocked_by: ["hsz5"] }],
    ["blocks", { add_blocks: ["hsz5"] }],
    ["related", { add_related: ["hsz5"] }],
  ] as const)("addIssueRelation(%s)", async (kind, delta) => {
    await addIssueRelation("p#fb5j", kind, "p#hsz5");
    expect(lastCall()).toMatchObject({ method: "PATCH", body: { actor: "andy", links_delta: delta } });
  });

  it.each([
    ["parent", { remove_parent: "hsz5" }],
    ["blocked-by", { remove_blocked_by: ["hsz5"] }],
    ["blocks", { remove_blocks: ["hsz5"] }],
    ["related", { remove_related: ["hsz5"] }],
  ] as const)("removeIssueRelation(%s)", async (kind, delta) => {
    await removeIssueRelation("p#fb5j", kind, "p#hsz5");
    expect(lastCall().body).toEqual({ actor: "andy", links_delta: delta });
  });

  it("keeps the qualified reference for a relation in another project", async () => {
    await addIssueRelation("p#fb5j", "related", "q#abcd");
    expect(lastCall().body.links_delta).toEqual({ add_related: ["q#abcd"] });
  });

  it("closeIssue sends typed evidence", async () => {
    await closeIssue("p#fb5j", "done", "m", "commit:abc");
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: "/api/v1/projects/22/issues/fb5j/actions/close",
      body: {
        actor: "andy",
        dry_run: false,
        evidence: [{ sha: "abc", type: "commit" }],
        message: "m",
        reason: "done",
      },
    });
  });

  it("closeIssue omits evidence when empty and rejects invalid evidence before sending", async () => {
    await closeIssue("p#fb5j", "wontfix", "m", "");
    expect(lastCall().body).not.toHaveProperty("evidence");
    const callsBefore = sentCalls().length;
    await expect(closeIssue("p#fb5j", "done", "m", "nonsense")).rejects.toThrow("Invalid evidence");
    expect(sentCalls()).toHaveLength(callsBefore);
  });

  it("removeIssueLabel is a DELETE with the actor in the query", async () => {
    await removeIssueLabel("p#fb5j", "needs review");
    expect(lastCall()).toEqual({
      method: "DELETE",
      path: "/api/v1/projects/22/issues/fb5j/labels/needs%20review?actor=andy",
      headers: expect.any(Object),
      body: undefined,
    });
  });

  it("removeIssueLabel omits the actor query when unset", async () => {
    setConnection({ actor: undefined });
    await removeIssueLabel("p#fb5j", "lbl");
    expect(lastCall().path).toBe("/api/v1/projects/22/issues/fb5j/labels/lbl");
  });

  it("setIssueDeadline clears with null", async () => {
    await setIssueDeadline("p#fb5j", undefined);
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: "/api/v1/projects/22/issues/fb5j/metadata",
      body: { actor: "andy", patch: { deadline_on: null } },
    });
  });

  it("setIssueAttention patches the attention message only when given", async () => {
    await setIssueAttention("p#fb5j", "stuck", "waiting");
    expect(lastCall().body.patch).toEqual({ "work.attention": "stuck", "work.attention_msg": "waiting" });
    await setIssueAttention("p#fb5j", "ok", "");
    expect(lastCall().body.patch).toEqual({ "work.attention": "ok" });
  });

  it("notifyIssue and clearIssueRequest patch the notify key", async () => {
    await notifyIssue("p#fb5j", "someone", "hi");
    expect(lastCall().body).toEqual({
      actor: "andy",
      patch: { "notify.c29tZW9uZQ": { from: "andy", message: "hi" } },
    });
    await clearIssueRequest("p#fb5j", "someone");
    expect(lastCall().body).toEqual({ actor: "andy", patch: { "notify.c29tZW9uZQ": null } });
  });

  it("notifyIssue omits from and actor when the connection has no actor", async () => {
    setConnection({ actor: undefined });
    await notifyIssue("p#fb5j", "someone", "hi");
    expect(lastCall().body).toEqual({ patch: { "notify.c29tZW9uZQ": { message: "hi" } } });
  });

  it.each([
    [false, { to_project_uid: "UID23" }],
    [true, { single: true, to_project_uid: "UID23" }],
  ])("moveIssue(single=%s)", async (single, expected) => {
    await moveIssue("p#fb5j", "q", single);
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: "/api/v1/projects/22/issues/fb5j/actions/move",
      body: { actor: "andy", ...expected },
    });
  });

  it("deleteIssue sends the actor, falling back to the instance actor", async () => {
    await deleteIssue("p#fb5j");
    expect(lastCall()).toMatchObject({
      path: "/api/v1/projects/22/issues/fb5j/actions/delete",
      body: { actor: "andy" },
    });

    setConnection({ actor: undefined });
    stubFetch((url) => (url.pathname === "/api/v1/instance" ? { auth: { kind: "token", actor: "tokenactor" } } : {}));
    await deleteIssue("p#fb5j");
    expect(lastCall().body).toEqual({ actor: "tokenactor" });
  });

  it("searchIssues sends status only when filtered", async () => {
    stubFetch(() => ({ results: [{ issue: { uid: "u" } }] }));
    await expect(searchIssues("cookie", "p", "open", true)).resolves.toEqual([{ issue: { uid: "u" } }]);
    expect(lastCall().path).toBe("/api/v1/projects/22/search?q=cookie&limit=50&status=open&include_deleted=true");
    await searchIssues("cookie", "p", "all", false);
    expect(lastCall().path).toBe("/api/v1/projects/22/search?q=cookie&limit=50&include_deleted=false");
  });

  it("nextIssue asks for one issue sorted by priority", async () => {
    stubFetch(() => ({ issues: [{ uid: "u" }] }));
    await expect(nextIssue()).resolves.toEqual({ uid: "u" });
    expect(lastCall().path).toBe("/api/v1/ready?limit=1&sort=priority");
    stubFetch(() => ({ issues: [] }));
    await expect(nextIssue()).resolves.toBeNull();
  });

  it.each([
    [undefined, "/api/v1/digest"],
    [22, "/api/v1/projects/22/digest"],
  ])("showDigest(project id %s) sends RFC3339 since and until", async (projectId, path) => {
    await showDigest("7d", projectId);
    const url = new URL(`${SERVER}${lastCall().path}`);
    expect(url.pathname).toBe(path);
    const since = Date.parse(url.searchParams.get("since") as string);
    const until = Date.parse(url.searchParams.get("until") as string);
    expect(until - since).toBe(7 * 24 * 60 * 60 * 1000);
    expect(url.searchParams.get("since")).toMatch(/Z$/);
  });
});

describe("inbox", () => {
  it("queries open issues by notify metadata and maps sender and message", async () => {
    stubFetch(() => ({
      issues: [
        {
          qualified_id: "p#fb5j",
          title: "T",
          metadata: { "notify.c29tZW9uZQ": { from: "andy", message: "look" } },
        },
      ],
    }));
    await expect(listInbox("someone")).resolves.toEqual([
      { qualified_id: "p#fb5j", title: "T", from: "andy", message: "look" },
    ]);
    expect(lastCall().path).toBe("/api/v1/issues?limit=0&status=open&meta=notify.c29tZW9uZQ");
  });

  it("currentActor prefers the token actor, then the connection actor", async () => {
    stubFetch(() => ({ auth: { kind: "token", actor: "tokenactor" } }));
    await expect(currentActor()).resolves.toBe("tokenactor");
    stubFetch(() => ({ auth: { kind: "static_token" } }));
    await expect(currentActor()).resolves.toBe("andy");
    setConnection({ actor: undefined });
    await expect(currentActor()).resolves.toBeUndefined();
  });
});
