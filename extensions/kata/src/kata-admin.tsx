import { Action, ActionPanel, Icon, Keyboard, List } from "@raycast/api";
import { useState } from "react";
import { AdminView, healthCheck, listAdminItems, listProjects, whoAmI } from "./kata";
import { adminItemTitle, jsonMarkdown } from "./formatting";
import {
  ConnectionActions,
  ConnectionGate,
  connectionTitle,
  useActiveConnection,
  useKataPromise,
} from "./connection-ui";

type View = AdminView | "identity";

const VIEWS: { value: View; title: string }[] = [
  { value: "cron-jobs", title: "Cron Jobs" },
  { value: "cron-runs", title: "Cron Runs" },
  { value: "cron-workflows", title: "Cron Workflows" },
  { value: "teams", title: "Teams" },
  { value: "tokens", title: "Tokens" },
  { value: "identity", title: "Who Am I" },
];

async function loadIdentity() {
  const [identity, health] = await Promise.all([whoAmI(), healthCheck()]);
  return [
    { title: "Who Am I", value: identity },
    { title: "Daemon Health", value: health },
  ];
}

function AdminContent() {
  const { connection } = useActiveConnection();
  const [view, setView] = useState<View>("cron-jobs");
  const [selectedProject, setSelectedProject] = useState<string>();
  const projects = useKataPromise(listProjects, []);
  const project = selectedProject ?? projects.data?.[0]?.name;
  const needsProject = view.startsWith("cron-");

  const items = useKataPromise(listAdminItems, [view as AdminView, project ?? ""], {
    execute: view !== "identity" && (!needsProject || !!project),
  });
  const identity = useKataPromise(loadIdentity, [], { execute: view === "identity" });
  const isLoading = projects.isLoading || items.isLoading || identity.isLoading;
  const rows =
    view === "identity"
      ? (identity.data ?? [])
      : (items.data ?? []).map((item) => ({ title: adminItemTitle(item), value: item as unknown }));
  const viewTitle = VIEWS.find((v) => v.value === view)?.title;
  const projectPicker = needsProject && projects.data && (
    <ActionPanel.Submenu title="Select Project" icon={Icon.Folder} shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}>
      {projects.data.map((p) => (
        <Action
          key={p.name}
          title={p.name}
          icon={p.name === project ? Icon.Checkmark : undefined}
          onAction={() => setSelectedProject(p.name)}
        />
      ))}
    </ActionPanel.Submenu>
  );

  return (
    <List
      navigationTitle={connectionTitle(connection)}
      isLoading={isLoading}
      isShowingDetail
      searchBarAccessory={
        <List.Dropdown tooltip="View" storeValue onChange={(value) => setView(value as View)}>
          {VIEWS.map((v) => (
            <List.Dropdown.Item key={v.value} title={v.title} value={v.value} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.Info}
        title={`No ${viewTitle}`}
        description={needsProject ? `Project: ${project}` : undefined}
        actions={
          <ActionPanel>
            {projectPicker}
            <ConnectionActions />
          </ActionPanel>
        }
      />
      <List.Section title={viewTitle} subtitle={needsProject ? project : undefined}>
        {rows.map((row, index) => (
          <List.Item
            key={`${row.title}:${index}`}
            title={row.title}
            detail={<List.Item.Detail markdown={jsonMarkdown(row.value)} />}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy JSON" content={JSON.stringify(row.value, null, 2)} />
                {projectPicker}
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={() => {
                    items.revalidate();
                    identity.revalidate();
                  }}
                />
                <ConnectionActions />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

export default function Command() {
  return (
    <ConnectionGate>
      <AdminContent />
    </ConnectionGate>
  );
}
