import { execFile } from "child_process";
import { getPreferenceValues } from "@raycast/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addIssueLabel,
  addIssueRelation,
  assignIssue,
  claimIssue,
  closeIssue,
  commentIssue,
  createIssue,
  deleteIssue,
  editIssue,
  kata,
  listIssues,
  listProjectIssues,
  listProjects,
  moveIssue,
  NewIssue,
  removeIssueLabel,
  removeIssueRelation,
  reopenIssue,
  searchIssues,
  setIssueAttention,
  setIssueDeadline,
  setIssuePriority,
  showDigest,
  showIssue,
  unassignIssue,
} from "./kata";

vi.mock("@raycast/api", () => ({ getPreferenceValues: vi.fn(() => ({ kataPath: "/test/kata" })) }));
vi.mock("child_process", () => ({ execFile: vi.fn() }));

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

function respond(result: { error?: Error; stdout?: string; stderr?: string } = {}) {
  const end = vi.fn();
  vi.mocked(execFile).mockImplementationOnce(((_file: string, _args: string[], _opts: object, cb: ExecCallback) => {
    queueMicrotask(() => cb(result.error ?? null, result.stdout ?? "{}", result.stderr ?? ""));
    return { stdin: { end } };
  }) as unknown as typeof execFile);
  return { end };
}

function lastCall() {
  const [file, args, opts] = vi.mocked(execFile).mock.calls[0] as unknown as [
    string,
    string[],
    { maxBuffer: number; env: { PATH: string } },
  ];
  return { file, args, opts };
}

beforeEach(() => {
  vi.mocked(execFile).mockReset();
});

describe("kata()", () => {
  it("resolves with parsed stdout JSON", async () => {
    respond({ stdout: '{"a":1}' });
    await expect(kata(["x"])).resolves.toEqual({ a: 1 });
  });

  it("calls execFile with the preference path, --json, buffer limit and extended PATH", async () => {
    respond();
    await kata(["list", "foo"]);
    const { file, args, opts } = lastCall();
    expect(file).toBe("/test/kata");
    expect(args).toEqual(["list", "foo", "--json"]);
    expect(opts.maxBuffer).toBe(64 * 1024 * 1024);
    expect(opts.env.PATH.startsWith("/opt/homebrew/bin:/usr/local/bin:")).toBe(true);
  });

  it("passes remote server preferences to the child environment only when set", async () => {
    vi.mocked(getPreferenceValues).mockReturnValueOnce({
      kataPath: "/test/kata",
      serverUrl: "http://100.1.2.3:7777",
      authToken: "secret",
      actor: "andy",
    });
    respond();
    await kata(["x"]);
    const { opts } = lastCall();
    expect(opts.env).toMatchObject({
      KATA_SERVER: "http://100.1.2.3:7777",
      KATA_AUTH_TOKEN: "secret",
      KATA_AUTHOR: "andy",
    });

    vi.mocked(execFile).mockReset();
    vi.mocked(getPreferenceValues).mockReturnValueOnce({ kataPath: "/test/kata", serverUrl: "", actor: "" });
    respond();
    await kata(["x"]);
    expect(Object.keys(lastCall().opts.env)).not.toContain("KATA_SERVER");
    expect(Object.keys(lastCall().opts.env)).not.toContain("KATA_AUTHOR");
  });

  it("falls back to 'kata' when the preference is empty", async () => {
    vi.mocked(getPreferenceValues).mockReturnValueOnce({ kataPath: "" });
    respond();
    await kata(["x"]);
    expect(lastCall().file).toBe("kata");
  });

  it.each([
    ["a body", "body"],
    ["the empty string", ""],
  ])("passes stdin to the child when given %s", async (_name, stdin) => {
    const { end } = respond();
    await kata(["x"], stdin);
    expect(end).toHaveBeenCalledExactlyOnceWith(stdin);
  });

  it("does not touch stdin when omitted", async () => {
    const { end } = respond();
    await kata(["x"]);
    expect(end).not.toHaveBeenCalled();
  });

  describe("errors", () => {
    const fail = new Error("Command failed");

    it("rejects with the JSON error message from stdout", async () => {
      respond({ error: fail, stdout: '{"error":{"message":"boom"}}' });
      await expect(kata(["x"])).rejects.toThrow("boom");
    });

    it("prefers stdout over a non-empty stderr", async () => {
      respond({ error: fail, stdout: '{"error":{"message":"boom"}}', stderr: "noise" });
      await expect(kata(["x"])).rejects.toThrow("boom");
    });

    it("falls back to stderr when the JSON has no error key", async () => {
      respond({ error: fail, stdout: "{}", stderr: "bad thing\n" });
      await expect(kata(["x"])).rejects.toThrow(/^bad thing$/);
    });

    it("falls back to trimmed stderr when stdout is not JSON", async () => {
      respond({ error: fail, stdout: "not json", stderr: "  oops \n" });
      await expect(kata(["x"])).rejects.toThrow(/^oops$/);
    });

    it("falls back to the exec error message when stderr is empty", async () => {
      respond({ error: fail, stdout: "not json", stderr: "" });
      await expect(kata(["x"])).rejects.toThrow("Command failed");
    });
  });
});

describe("wrappers", () => {
  it.each([
    ["open", ["list", "--all", "--status", "open", "--limit", "0", "--json"]],
    ["closed", ["list", "--all", "--status", "closed", "--limit", "0", "--json"]],
    ["all", ["list", "--all", "--status", "all", "--limit", "0", "--json"]],
  ] as const)("listIssues(%s)", async (status, expected) => {
    respond({ stdout: '{"issues":[{"uid":"u"}]}' });
    await expect(listIssues(status)).resolves.toEqual([{ uid: "u" }]);
    expect(lastCall().args).toEqual(expected);
  });

  it("listProjectIssues", async () => {
    respond({ stdout: '{"issues":[]}' });
    await expect(listProjectIssues("p")).resolves.toEqual([]);
    expect(lastCall().args).toEqual(["list", "--project", "p", "--status", "open", "--limit", "0", "--json"]);
  });

  it("listProjects", async () => {
    respond({ stdout: '{"projects":[{"name":"p"}]}' });
    await expect(listProjects()).resolves.toEqual([{ name: "p" }]);
    expect(lastCall().args).toEqual(["projects", "list", "--json"]);
  });

  it("showIssue", async () => {
    respond({ stdout: '{"issue":{},"comments":[]}' });
    await expect(showIssue("r")).resolves.toEqual({ issue: {}, comments: [] });
    expect(lastCall().args).toEqual(["show", "r", "--json"]);
  });

  describe("createIssue", () => {
    const base: NewIssue = {
      project: "p",
      title: "T",
      body: "B",
      priority: "",
      labels: [],
      owner: "",
      parent: "",
      blockedBy: [],
    };

    it("sends only required fields, with the body on stdin", async () => {
      const { end } = respond();
      await createIssue(base);
      expect(lastCall().args).toEqual(["create", "T", "--project", "p", "--body-stdin", "--json"]);
      expect(end).toHaveBeenCalledWith("B");
    });

    it("sends the empty body on stdin so --body-stdin does not hang", async () => {
      const { end } = respond();
      await createIssue({ ...base, body: "" });
      expect(end).toHaveBeenCalledWith("");
    });

    it("appends every optional field in source order", async () => {
      respond();
      await createIssue({
        ...base,
        priority: "1",
        labels: ["a", "b"],
        owner: "alice",
        parent: "par",
        blockedBy: ["x", "y"],
      });
      expect(lastCall().args).toEqual([
        "create",
        "T",
        "--project",
        "p",
        "--body-stdin",
        "--priority",
        "1",
        "--label",
        "a",
        "--label",
        "b",
        "--owner",
        "alice",
        "--parent",
        "par",
        "--blocked-by",
        "x",
        "--blocked-by",
        "y",
        "--json",
      ]);
    });
  });

  it("commentIssue sends the body on stdin", async () => {
    const { end } = respond();
    await commentIssue("r", "hi");
    expect(lastCall().args).toEqual(["comment", "r", "--body-stdin", "--json"]);
    expect(end).toHaveBeenCalledWith("hi");
  });

  describe("closeIssue", () => {
    it("omits --evidence when empty", async () => {
      respond();
      await closeIssue("r", "x", "m", "");
      expect(lastCall().args).toEqual(["close", "r", "--reason", "x", "--message", "m", "--json"]);
    });

    it("appends --evidence when given", async () => {
      respond();
      await closeIssue("r", "x", "m", "e");
      expect(lastCall().args).toEqual(["close", "r", "--reason", "x", "--message", "m", "--evidence", "e", "--json"]);
    });
  });

  describe("editIssue", () => {
    it.each([
      ["title only", { title: "T" }, ["edit", "r", "--title=T", "--json"]],
      ["body only", { body: "B" }, ["edit", "r", "--body=B", "--json"]],
      ["title before body", { body: "B", title: "T" }, ["edit", "r", "--title=T", "--body=B", "--json"]],
      ["no changes", {}, ["edit", "r", "--json"]],
      ["a dash-prefixed title as a value", { title: "-x" }, ["edit", "r", "--title=-x", "--json"]],
      ["an empty body", { body: "" }, ["edit", "r", "--body=", "--json"]],
    ])("%s", async (_name, changes, expected) => {
      respond();
      await editIssue("r", changes);
      expect(lastCall().args).toEqual(expected);
    });

    it("passes the body inline, not on stdin", async () => {
      const { end } = respond();
      await editIssue("r", { body: "B" });
      expect(end).not.toHaveBeenCalled();
    });
  });

  it.each([
    [2, "--priority=2"],
    [0, "--priority=0"],
    [undefined, "--priority=-"],
  ])("setIssuePriority(%s)", async (priority, flag) => {
    respond();
    await setIssuePriority("r", priority);
    expect(lastCall().args).toEqual(["edit", "r", flag, "--json"]);
  });

  it.each([
    ["claimIssue", () => claimIssue("r"), ["claim", "r", "--json"]],
    ["reopenIssue", () => reopenIssue("r"), ["reopen", "r", "--json"]],
    ["assignIssue", () => assignIssue("r", "alice"), ["assign", "r", "alice", "--json"]],
    ["unassignIssue", () => unassignIssue("r"), ["unassign", "r", "--json"]],
    ["addIssueLabel", () => addIssueLabel("r", "l"), ["label", "add", "r", "l", "--json"]],
    ["removeIssueLabel", () => removeIssueLabel("r", "l"), ["label", "rm", "r", "l", "--json"]],
  ])("%s", async (_name, call, expected) => {
    const { end } = respond();
    await call();
    expect(lastCall().args).toEqual(expected);
    expect(end).not.toHaveBeenCalled();
  });

  describe("issue relations", () => {
    it.each([
      ["parent", "--parent=t"],
      ["blocked-by", "--blocked-by=t"],
      ["blocks", "--blocks=t"],
      ["related", "--related=t"],
    ] as const)("addIssueRelation(%s)", async (kind, flag) => {
      respond();
      await addIssueRelation("r", kind, "t");
      expect(lastCall().args).toEqual(["edit", "r", flag, "--json"]);
    });

    it.each([
      ["parent", "--remove-parent=t"],
      ["blocked-by", "--remove-blocked-by=t"],
      ["blocks", "--remove-blocks=t"],
      ["related", "--remove-related=t"],
    ] as const)("removeIssueRelation(%s)", async (kind, flag) => {
      respond();
      await removeIssueRelation("r", kind, "t");
      expect(lastCall().args).toEqual(["edit", "r", flag, "--json"]);
    });
  });
});

describe("planning, search and admin wrappers", () => {
  it("setIssueDeadline sends - to clear", async () => {
    respond();
    await setIssueDeadline("p#abcd", undefined);
    expect(lastCall().args).toEqual(["deadline", "p#abcd", "-", "--json"]);
  });

  it("setIssueAttention writes the message only when given", async () => {
    respond();
    respond();
    await setIssueAttention("p#abcd", "stuck", "waiting on review");
    const argsOfCalls = vi.mocked(execFile).mock.calls.map((c) => c[1]);
    expect(argsOfCalls).toEqual([
      ["meta", "set", "p#abcd", "work.attention", "stuck", "--json"],
      ["meta", "set", "p#abcd", "work.attention_msg", "waiting on review", "--json"],
    ]);

    vi.mocked(execFile).mockReset();
    respond();
    await setIssueAttention("p#abcd", "ok", "");
    expect(vi.mocked(execFile).mock.calls).toHaveLength(1);
  });

  it("deleteIssue confirms with the exact qualified id", async () => {
    respond();
    await deleteIssue("p#abcd");
    expect(lastCall().args).toEqual(["delete", "p#abcd", "--force", "--confirm", "DELETE p#abcd", "--json"]);
  });

  it.each([
    [false, ["move", "p#abcd", "q", "--json"]],
    [true, ["move", "p#abcd", "q", "--single", "--json"]],
  ])("moveIssue(single=%s)", async (single, expected) => {
    respond();
    await moveIssue("p#abcd", "q", single);
    expect(lastCall().args).toEqual(expected);
  });

  it.each([
    ["all", false, ["search", "q", "--project", "p", "--limit", "50", "--json"]],
    [
      "open",
      true,
      ["search", "q", "--project", "p", "--limit", "50", "--status", "open", "--include-deleted", "--json"],
    ],
  ] as const)("searchIssues(status=%s, includeDeleted=%s)", async (status, includeDeleted, expected) => {
    respond({ stdout: '{"results":[{"issue":{"uid":"u"}}]}' });
    await expect(searchIssues("q", "p", status, includeDeleted)).resolves.toEqual([{ issue: { uid: "u" } }]);
    expect(lastCall().args).toEqual(expected);
  });

  it.each([
    [undefined, ["digest", "--all", "--since", "7d", "--json"]],
    [22, ["digest", "--project-id", "22", "--since", "7d", "--json"]],
  ])("showDigest(project id %s)", async (projectId, expected) => {
    respond();
    await showDigest("7d", projectId);
    expect(lastCall().args).toEqual(expected);
  });
});
