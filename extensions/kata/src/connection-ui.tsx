import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  Keyboard,
  List,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { Fragment, ReactNode, useEffect, useState } from "react";
import {
  Connection,
  addConnection,
  deleteConnection,
  getActiveConnectionId,
  loadConnections,
  normalizeInput,
  setActiveConnection,
  subscribeToConnections,
  updateConnection,
  validateServerUrl,
} from "./connections";
import { testConnection } from "./kata";

export function useActiveConnection() {
  const [state, setState] = useState<{ connections: Connection[]; activeId?: string; isLoading: boolean }>({
    connections: [],
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [connections, activeId] = await Promise.all([loadConnections(), getActiveConnectionId()]);
      if (!cancelled) setState({ connections, activeId, isLoading: false });
    }
    load();
    const unsubscribe = subscribeToConnections(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    connections: state.connections,
    connection: state.connections.find((candidate) => candidate.id === state.activeId),
    isLoading: state.isLoading,
  };
}

export function useKataPromise<Args extends unknown[], Result>(
  fetchData: (...args: Args) => Promise<Result>,
  args: Args,
  options: { execute?: boolean; keepPreviousData?: boolean } = {},
) {
  const { connection, isLoading } = useActiveConnection();
  const state = useCachedPromise(
    (_connectionId: string, ...rest: Args) => fetchData(...rest),
    [connection?.id ?? "", ...args],
    { ...options, execute: !!connection && options.execute !== false },
  );
  return { ...state, isLoading: state.isLoading || isLoading };
}

export function ConnectionGate({ children }: { children: ReactNode }) {
  const { connection, isLoading } = useActiveConnection();
  if (isLoading) return <List isLoading />;
  if (!connection) return <ConnectionForm />;
  return <Fragment key={connection.id}>{children}</Fragment>;
}

export function connectionTitle(connection: Connection | undefined, title = "Kata"): string {
  return connection ? `${title} · ${connection.name}` : title;
}

export function ConnectionForm({ connection, pushed }: { connection?: Connection; pushed?: boolean }) {
  const { pop } = useNavigation();
  const [nameError, setNameError] = useState<string>();
  const [serverUrlError, setServerUrlError] = useState<string>();

  async function submit(values: Omit<Connection, "id">, shouldTest: boolean) {
    const input = normalizeInput(values);
    const urlProblem = validateServerUrl(input.serverUrl);
    setNameError(input.name ? undefined : "Name is required");
    setServerUrlError(urlProblem);
    if (!input.name || urlProblem) return;
    if (shouldTest) {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Testing connection" });
      try {
        await testConnection({ id: "connection-test", ...input });
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Connection test failed";
        toast.message = error instanceof Error ? error.message : String(error);
        return;
      }
      toast.hide();
    }
    if (connection) await updateConnection(connection.id, input);
    else await addConnection(input);
    await showToast({ style: Toast.Style.Success, title: "Connection saved" });
    if (pushed) pop();
  }

  return (
    <Form
      navigationTitle={connection ? `Edit ${connection.name}` : "Add Connection"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Test and Save"
            onSubmit={(values: Omit<Connection, "id">) => submit(values, true)}
          />
          <Action.SubmitForm
            title="Save Without Testing"
            icon={Icon.Warning}
            shortcut={{ modifiers: ["cmd", "opt"], key: "s" }}
            onSubmit={(values: Omit<Connection, "id">) => submit(values, false)}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Personal"
        defaultValue={connection?.name}
        error={nameError}
        onChange={() => setNameError(undefined)}
      />
      <Form.TextField
        id="serverUrl"
        title="Server URL"
        placeholder="http://100.x.y.z:7777"
        defaultValue={connection?.serverUrl}
        error={serverUrlError}
        onChange={() => setServerUrlError(undefined)}
      />
      <Form.PasswordField
        id="authToken"
        title="Auth Token"
        placeholder="Optional"
        info="Leave empty for a server that allows tokenless private-network access. Otherwise create one on the server with `kata tokens create --actor <name> --name <label>`."
        defaultValue={connection?.authToken}
      />
      <Form.TextField
        id="actor"
        title="Actor"
        placeholder="Optional"
        info="Recommended without a token, because the server then records changes under this name. With a token it is only needed if the server does not report the token's actor. Used for the Inbox recipient, the sender of Notify requests, Clear Request and as the author of changes."
        defaultValue={connection?.actor}
      />
    </Form>
  );
}

export function ConnectionActions() {
  const { connections, connection } = useActiveConnection();
  return (
    <ActionPanel.Section>
      <ActionPanel.Submenu
        title="Switch Connection"
        icon={Icon.Switch}
        shortcut={{ modifiers: ["cmd", "ctrl"], key: "s" }}
      >
        {connections.map((candidate) => (
          <Action
            key={candidate.id}
            title={candidate.name}
            icon={candidate.id === connection?.id ? Icon.Checkmark : undefined}
            onAction={() => setActiveConnection(candidate.id)}
          />
        ))}
      </ActionPanel.Submenu>
      <Action.Push title="Manage Connections…" icon={Icon.Network} target={<ManageConnectionsList />} />
    </ActionPanel.Section>
  );
}

export function ManageConnectionsList() {
  const { connections, connection: activeConnection, isLoading } = useActiveConnection();

  async function runTest(connection: Connection) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Testing ${connection.name}` });
    try {
      await testConnection(connection);
      toast.style = Toast.Style.Success;
      toast.title = `${connection.name} is reachable`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = `${connection.name} failed`;
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function confirmDelete(connection: Connection) {
    const confirmed = await confirmAlert({
      title: `Delete ${connection.name}?`,
      message: "The saved server URL and auth token will be removed from this Mac.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (confirmed) await deleteConnection(connection.id);
  }

  const addAction = (
    <Action.Push
      title="Add Connection…"
      icon={Icon.Plus}
      shortcut={Keyboard.Shortcut.Common.New}
      target={<ConnectionForm pushed />}
    />
  );

  return (
    <List isLoading={isLoading} navigationTitle="Manage Connections">
      <List.EmptyView
        icon={Icon.Network}
        title="No connections"
        description="Add the kata server you want to use."
        actions={<ActionPanel>{addAction}</ActionPanel>}
      />
      {connections.map((connection) => {
        const isActive = connection.id === activeConnection?.id;
        return (
          <List.Item
            key={connection.id}
            title={connection.name}
            subtitle={connection.serverUrl}
            accessories={isActive ? [{ icon: Icon.Checkmark, text: "Active" }] : []}
            actions={
              <ActionPanel>
                {!isActive && (
                  <Action
                    title="Set as Active"
                    icon={Icon.Checkmark}
                    onAction={() => setActiveConnection(connection.id)}
                  />
                )}
                <Action.Push
                  title="Edit…"
                  icon={Icon.Pencil}
                  shortcut={Keyboard.Shortcut.Common.Edit}
                  target={<ConnectionForm connection={connection} pushed />}
                />
                {addAction}
                <Action title="Test Connection" icon={Icon.Heartbeat} onAction={() => runTest(connection)} />
                <Action
                  title="Delete"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                  onAction={() => confirmDelete(connection)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
