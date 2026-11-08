import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { listProjects, restoreIssue, searchIssues } from "./kata";
import { IssueView, run } from "./browse-issues";

type SearchStatus = "open" | "closed" | "all";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState<SearchStatus>("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const projects = useCachedPromise(listProjects);
  const query = searchText.trim();
  const results = useCachedPromise(searchIssues, [query, project, status, includeDeleted], {
    execute: query !== "" && project !== "",
    keepPreviousData: true,
  });
  const titles = new Map<string, string>();

  return (
    <List
      isLoading={projects.isLoading || results.isLoading}
      filtering={false}
      throttle
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search titles, bodies and comments…"
      searchBarAccessory={
        <List.Dropdown tooltip="Project" storeValue onChange={setProject}>
          {projects.data?.map((p) => (
            <List.Dropdown.Item key={p.name} title={p.name} value={p.name} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title={query ? "No matching issues" : "Search issues"}
        description={`Status: ${status}${includeDeleted ? " · including deleted" : ""}`}
        actions={
          <ActionPanel>
            <Action
              title={includeDeleted ? "Hide Deleted" : "Include Deleted"}
              icon={Icon.Trash}
              onAction={() => setIncludeDeleted(!includeDeleted)}
            />
          </ActionPanel>
        }
      />
      {results.data?.map((result) => {
        const issue = result.issue;
        const ref = `${project}#${issue.short_id}`;
        const isDeleted = !!issue.deleted_at;
        return (
          <List.Item
            key={issue.uid}
            title={issue.title}
            subtitle={ref}
            icon={
              issue.status === "open"
                ? { source: Icon.Circle, tintColor: Color.Green }
                : { source: Icon.CheckCircle, tintColor: Color.Purple }
            }
            accessories={[
              ...(isDeleted ? [{ tag: { value: "Deleted", color: Color.Red } }] : []),
              ...(result.matched_in?.length ? [{ text: result.matched_in.join(", ") }] : []),
            ]}
            actions={
              <ActionPanel>
                {!isDeleted && (
                  <Action.Push
                    title="Open Issue"
                    icon={Icon.Eye}
                    target={<IssueView issueRef={ref} titles={titles} onChange={results.revalidate} />}
                  />
                )}
                {isDeleted && (
                  <Action
                    title="Restore Issue"
                    icon={Icon.ArrowCounterClockwise}
                    onAction={() => run("Restoring issue", () => restoreIssue(ref), results.revalidate)}
                  />
                )}
                <Action.OpenInBrowser title="Open in Kata Web UI" url={result.web_url} />
                <Action.CopyToClipboard
                  title="Copy Reference"
                  content={ref}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <ActionPanel.Section>
                  <Action
                    title={includeDeleted ? "Hide Deleted" : "Include Deleted"}
                    icon={Icon.Trash}
                    shortcut={{ modifiers: ["cmd", "opt"], key: "d" }}
                    onAction={() => setIncludeDeleted(!includeDeleted)}
                  />
                  <ActionPanel.Submenu
                    title="Status"
                    icon={Icon.Filter}
                    shortcut={{ modifiers: ["cmd", "opt"], key: "s" }}
                  >
                    {(["all", "open", "closed"] as const).map((option) => (
                      <Action
                        key={option}
                        title={option[0].toUpperCase() + option.slice(1)}
                        icon={option === status ? Icon.Checkmark : undefined}
                        onAction={() => setStatus(option)}
                      />
                    ))}
                  </ActionPanel.Submenu>
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
