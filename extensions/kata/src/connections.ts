import { LocalStorage } from "@raycast/api";

export interface Connection {
  id: string;
  name: string;
  serverUrl: string;
  authToken?: string;
  actor?: string;
}

export type ConnectionInput = Omit<Connection, "id">;

const CONNECTIONS_KEY = "connections";
const ACTIVE_CONNECTION_KEY = "activeConnectionId";

const listeners = new Set<() => void>();

export function subscribeToConnections(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  for (const listener of listeners) listener();
}

export function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/+$/, "");
}

export function validateServerUrl(serverUrl: string): string | undefined {
  try {
    const { protocol } = new URL(normalizeServerUrl(serverUrl));
    return protocol === "http:" || protocol === "https:" ? undefined : "URL must start with http:// or https://";
  } catch {
    return "Enter a valid URL, for example http://100.x.y.z:7777";
  }
}

export function normalizeInput(input: ConnectionInput): ConnectionInput {
  return {
    name: input.name.trim(),
    serverUrl: normalizeServerUrl(input.serverUrl),
    authToken: input.authToken?.trim() || undefined,
    actor: input.actor?.trim() || undefined,
  };
}

export async function loadConnections(): Promise<Connection[]> {
  const stored = await LocalStorage.getItem<string>(CONNECTIONS_KEY);
  return stored ? (JSON.parse(stored) as Connection[]) : [];
}

async function saveConnections(connections: Connection[]) {
  await LocalStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
}

export async function getActiveConnectionId(): Promise<string | undefined> {
  const connections = await loadConnections();
  const storedId = await LocalStorage.getItem<string>(ACTIVE_CONNECTION_KEY);
  return (connections.find((connection) => connection.id === storedId) ?? connections[0])?.id;
}

export async function getActiveConnection(): Promise<Connection | undefined> {
  const connections = await loadConnections();
  const activeId = await getActiveConnectionId();
  return connections.find((connection) => connection.id === activeId);
}

export async function setActiveConnection(id: string) {
  await LocalStorage.setItem(ACTIVE_CONNECTION_KEY, id);
  notifyListeners();
}

export async function addConnection(input: ConnectionInput): Promise<Connection> {
  const connections = await loadConnections();
  const connection = { id: crypto.randomUUID(), ...normalizeInput(input) };
  await saveConnections([...connections, connection]);
  if (connections.length === 0) await LocalStorage.setItem(ACTIVE_CONNECTION_KEY, connection.id);
  notifyListeners();
  return connection;
}

export async function updateConnection(id: string, input: ConnectionInput) {
  const connections = await loadConnections();
  await saveConnections(
    connections.map((connection) => (connection.id === id ? { id, ...normalizeInput(input) } : connection)),
  );
  notifyListeners();
}

export async function deleteConnection(id: string) {
  const activeId = await getActiveConnectionId();
  const remaining = (await loadConnections()).filter((connection) => connection.id !== id);
  await saveConnections(remaining);
  if (activeId === id) {
    if (remaining.length > 0) await LocalStorage.setItem(ACTIVE_CONNECTION_KEY, remaining[0].id);
    else await LocalStorage.removeItem(ACTIVE_CONNECTION_KEY);
  }
  notifyListeners();
}
