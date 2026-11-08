import { Action, ActionPanel, Icon, Keyboard, List } from "@raycast/api";
import { clearIssueRequest, currentActor, listInbox } from "./kata";
import { IssueView, run } from "./browse-issues";
import { jsonMarkdown } from "./formatting";
import {
  ConnectionActions,
  ConnectionGate,
  connectionTitle,
  useActiveConnection,
  useKataPromise,
} from "./connection-ui";

function InboxContent() {
  const { connection } = useActiveConnection();
  const actor = useKataPromise(currentActor, []);
  const inbox = useKataPromise(listInbox, [actor.data ?? ""], { execute: !!actor.data });
  const actorMissing = !actor.isLoading && !actor.data;
  const titles = new Map<string, string>();

  return (
    <List
      navigationTitle={connectionTitle(connection)}
      isLoading={actor.isLoading || inbox.isLoading}
      isShowingDetail
      searchBarPlaceholder="Filter requests…"
    >
      {actorMissing ? (
        <List.EmptyView
          icon={Icon.Person}
          title="Actor unknown"
          description="Set the Actor on this connection in Manage Connections so the inbox knows whose requests to show."
        />
      ) : (
        <List.EmptyView icon={Icon.Tray} title="Inbox is empty" description="No open attention requests for you." />
      )}
      {inbox.data?.map((request, index) => {
        const ref = request.qualified_id;
        const sender = request.from;
        return (
          <List.Item
            key={`${ref}:${index}`}
            title={request.title}
            subtitle={ref}
            accessories={sender ? [{ icon: Icon.Person, text: sender }] : []}
            detail={
              <List.Item.Detail
                markdown={`${request.message ? `${request.message}\n\n` : ""}${jsonMarkdown(request)}`}
              />
            }
            actions={
              <ActionPanel>
                <Action.Push
                  title="Open Issue"
                  icon={Icon.Eye}
                  target={<IssueView issueRef={ref} titles={titles} onChange={inbox.revalidate} />}
                />
                <Action
                  title="Clear Request"
                  icon={Icon.CheckCircle}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "k" }}
                  onAction={() =>
                    run("Clearing request", () => clearIssueRequest(ref, actor.data as string), inbox.revalidate)
                  }
                />
                <Action.CopyToClipboard
                  title="Copy Reference"
                  content={ref}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={inbox.revalidate}
                />
                <ConnectionActions />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export default function Command() {
  return (
    <ConnectionGate>
      <InboxContent />
    </ConnectionGate>
  );
}
