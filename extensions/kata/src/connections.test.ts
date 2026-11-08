import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addConnection,
  deleteConnection,
  getActiveConnection,
  loadConnections,
  normalizeServerUrl,
  setActiveConnection,
  subscribeToConnections,
  updateConnection,
  validateServerUrl,
} from "./connections";

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

const personal = { name: "Personal", serverUrl: "http://100.1.1.1:7777", authToken: "one" };
const team = { name: "Team", serverUrl: "http://100.2.2.2:7777/", authToken: "two", actor: " sam " };

beforeEach(() => {
  storage.clear();
});

describe("connection storage", () => {
  it("starts empty with no active connection", async () => {
    expect(await loadConnections()).toEqual([]);
    expect(await getActiveConnection()).toBeUndefined();
  });

  it("makes the first added connection active and keeps it when adding more", async () => {
    const first = await addConnection(personal);
    const second = await addConnection(team);
    expect((await getActiveConnection())?.id).toBe(first.id);
    expect((await loadConnections()).map((connection) => connection.id)).toEqual([first.id, second.id]);
  });

  it("normalizes the stored URL, token and actor", async () => {
    const added = await addConnection({ ...team, authToken: " two " });
    expect(added).toMatchObject({ serverUrl: "http://100.2.2.2:7777", authToken: "two", actor: "sam" });
    const stored = JSON.parse(storage.get("connections") as string);
    expect(stored).toEqual([added]);
    const tokenless = await addConnection({ ...personal, authToken: "  " });
    expect(tokenless.authToken).toBeUndefined();
  });

  it("switches the active connection", async () => {
    await addConnection(personal);
    const second = await addConnection(team);
    await setActiveConnection(second.id);
    expect((await getActiveConnection())?.name).toBe("Team");
  });

  it("edits a connection in place", async () => {
    const first = await addConnection(personal);
    await updateConnection(first.id, { ...personal, name: "Renamed", authToken: "new" });
    expect(await loadConnections()).toEqual([{ ...first, name: "Renamed", authToken: "new" }]);
  });

  it("activates the first remaining connection when the active one is deleted", async () => {
    const first = await addConnection(personal);
    const second = await addConnection(team);
    await setActiveConnection(second.id);
    await deleteConnection(second.id);
    expect((await getActiveConnection())?.id).toBe(first.id);
  });

  it("keeps the active connection when another one is deleted", async () => {
    const first = await addConnection(personal);
    const second = await addConnection(team);
    await deleteConnection(second.id);
    expect((await getActiveConnection())?.id).toBe(first.id);
  });

  it("clears the active connection when the last one is deleted", async () => {
    const only = await addConnection(personal);
    await deleteConnection(only.id);
    expect(await getActiveConnection()).toBeUndefined();
    expect(storage.has("activeConnectionId")).toBe(false);
  });

  it("falls back to the first connection when the stored active id is stale", async () => {
    const first = await addConnection(personal);
    storage.set("activeConnectionId", "missing");
    expect((await getActiveConnection())?.id).toBe(first.id);
  });

  it("notifies subscribers on changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToConnections(listener);
    const added = await addConnection(personal);
    await setActiveConnection(added.id);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await deleteConnection(added.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("server URL helpers", () => {
  it("normalizes whitespace and trailing slashes", () => {
    expect(normalizeServerUrl(" http://x:1// ")).toBe("http://x:1");
  });

  it.each([
    ["http://100.1.2.3:7777", undefined],
    ["https://kata.example.com/", undefined],
    ["100.1.2.3:7777", expect.any(String)],
    ["not a url", expect.any(String)],
    ["ftp://x", expect.any(String)],
  ])("validateServerUrl(%s)", (value, expected) => {
    expect(validateServerUrl(value)).toEqual(expected);
  });
});
