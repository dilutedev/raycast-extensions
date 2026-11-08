import { Action, ActionPanel, Icon, Keyboard, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { clearIssueRequest, currentActor, listInbox } from "./kata";
import { IssueView, run } from "./browse-issues";
import { jsonMarkdown, requestRef } from "./formatting";

export default function Command() {
  const actor = useCachedPromise(currentActor);
  const inbox = useCachedPromise(listInbox, [actor.data ?? ""], { execute: !!actor.data });
  const titles = new Map<string, string>();

  return (
    <List isLoading={actor.isLoading || inbox.isLoading} isShowingDetail searchBarPlaceholder="Filter requests…">
      <List.EmptyView icon={Icon.Tray} title="Inbox is empty" description="No open attention requests for you." />
      {inbox.data?.map((request, index) => {
        const ref = requestRef(request);
        const sender = request.from ?? request.sender ?? request.author;
        return (
          <List.Item
            key={`${ref ?? "request"}:${index}`}
            title={request.title ?? request.message ?? ref ?? "Request"}
            subtitle={ref}
            accessories={sender ? [{ icon: Icon.Person, text: sender }] : []}
            detail={
              <List.Item.Detail
                markdown={`${request.message ? `${request.message}\n\n` : ""}${jsonMarkdown(request)}`}
              />
            }
            actions={
              <ActionPanel>
                {ref && (
                  <Action.Push
                    title="Open Issue"
                    icon={Icon.Eye}
                    target={<IssueView issueRef={ref} titles={titles} onChange={inbox.revalidate} />}
                  />
                )}
                {ref && actor.data && (
                  <Action
                    title="Clear Request"
                    icon={Icon.CheckCircle}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "k" }}
                    onAction={() =>
                      run("Clearing request", () => clearIssueRequest(ref, actor.data as string), inbox.revalidate)
                    }
                  />
                )}
                {ref && (
                  <Action.CopyToClipboard
                    title="Copy Reference"
                    content={ref}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                )}
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={inbox.revalidate}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
