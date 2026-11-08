import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { Issue, claimIssue, listReadyIssues, nextIssue } from "./kata";
import { IssueView, run } from "./browse-issues";

export default function Command() {
  const ready = useCachedPromise(listReadyIssues);
  const next = useCachedPromise(nextIssue);
  const refresh = () => {
    ready.revalidate();
    next.revalidate();
  };
  const titles = new Map((ready.data ?? []).map((issue) => [issue.qualified_id, issue.title]));

  function renderItem(issue: Issue, idPrefix: string) {
    return (
      <List.Item
        key={`${idPrefix}:${issue.uid}`}
        id={`${idPrefix}:${issue.uid}`}
        title={issue.title}
        subtitle={issue.qualified_id}
        icon={{ source: Icon.Circle, tintColor: Color.Green }}
        accessories={[
          ...(issue.priority !== undefined ? [{ tag: `P${issue.priority}` }] : []),
          ...(issue.owner ? [{ icon: Icon.Person, text: issue.owner }] : []),
        ]}
        actions={
          <ActionPanel>
            <Action.Push
              title="Open Issue"
              icon={Icon.Eye}
              target={<IssueView issueRef={issue.qualified_id} titles={titles} onChange={refresh} />}
            />
            <Action
              title="Claim Issue"
              icon={Icon.Person}
              shortcut={{ modifiers: ["cmd"], key: "l" }}
              onAction={() => run("Claiming issue", () => claimIssue(issue.qualified_id), refresh)}
            />
            <Action.CopyToClipboard
              title="Copy Reference"
              content={issue.qualified_id}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
            <Action.OpenInBrowser title="Open in Kata Web UI" url={issue.web_url} />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={refresh}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List isLoading={ready.isLoading || next.isLoading} searchBarPlaceholder="Filter ready issues…">
      {next.data && <List.Section title="Next Up">{renderItem(next.data, "next")}</List.Section>}
      <List.Section title="Ready" subtitle={ready.data ? String(ready.data.length) : undefined}>
        {ready.data?.map((issue) => renderItem(issue, "ready"))}
      </List.Section>
    </List>
  );
}
