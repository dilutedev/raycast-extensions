import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { listLabelCounts, listProjects, listRecentCloses, showDigest } from "./kata";
import { formatTotals, windowStart } from "./formatting";

const WINDOWS = {
  "24h": { title: "Last 24 Hours", hours: 24 },
  "7d": { title: "Last 7 Days", hours: 168 },
};

type WindowKey = keyof typeof WINDOWS;

export default function Command() {
  const [project, setProject] = useState("all");
  const [window, setWindow] = useState<WindowKey>("24h");
  const projects = useCachedPromise(listProjects);
  const projectId = projects.data?.find((p) => p.name === project)?.id;
  const specificProject = project !== "all";
  const closesSince = useMemo(() => windowStart(WINDOWS[window].hours, new Date()), [window]);

  const digest = useCachedPromise(showDigest, [window, projectId], {
    execute: !specificProject || projectId !== undefined,
  });
  const closes = useCachedPromise(listRecentCloses, [project, closesSince], { execute: specificProject });
  const labels = useCachedPromise(listLabelCounts, [project], { execute: specificProject });
  const refresh = () => {
    digest.revalidate();
    closes.revalidate();
    labels.revalidate();
  };
  const otherWindow: WindowKey = window === "24h" ? "7d" : "24h";

  const actions = (
    <ActionPanel>
      <Action
        title={`Show ${WINDOWS[otherWindow].title}`}
        icon={Icon.Clock}
        shortcut={{ modifiers: ["cmd", "shift"], key: "w" }}
        onAction={() => setWindow(otherWindow)}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={projects.isLoading || digest.isLoading || closes.isLoading || labels.isLoading}
      isShowingDetail
      searchBarAccessory={
        <List.Dropdown tooltip="Project" storeValue onChange={setProject}>
          <List.Dropdown.Item title="All Projects" value="all" />
          {projects.data?.map((p) => (
            <List.Dropdown.Item key={p.name} title={p.name} value={p.name} />
          ))}
        </List.Dropdown>
      }
    >
      {digest.data && (
        <List.Section title={`Digest – ${WINDOWS[window].title}`}>
          <List.Item
            title="All Actors"
            accessories={[{ text: `${digest.data.event_count} events` }]}
            detail={
              <List.Item.Detail
                markdown={
                  formatTotals(digest.data.totals)
                    .map((line) => `- ${line}`)
                    .join("\n") || "_No activity._"
                }
              />
            }
            actions={actions}
          />
        </List.Section>
      )}
      {digest.data && digest.data.actors.length > 0 && (
        <List.Section title="Actors">
          {digest.data.actors.map((actor) => (
            <List.Item
              key={actor.actor}
              title={actor.actor}
              icon={Icon.Person}
              subtitle={formatTotals(actor.totals).slice(0, 2).join(", ")}
              detail={
                <List.Item.Detail
                  markdown={
                    formatTotals(actor.totals)
                      .map((line) => `- ${line}`)
                      .join("\n") +
                    (actor.issues?.length
                      ? `\n\n## Issues\n\n` +
                        actor.issues
                          .map((i) => `- ${i.project_name}#${i.issue_short_id}: ${i.actions.join(", ")}`)
                          .join("\n")
                      : "")
                  }
                />
              }
              actions={actions}
            />
          ))}
        </List.Section>
      )}
      {specificProject && closes.data && (
        <List.Section title="Recent Closes">
          {closes.data.map((row) => (
            <List.Item
              key={row.event_id}
              title={row.message ?? row.issue}
              subtitle={`${project}#${row.issue}`}
              icon={{ source: Icon.CheckCircle, tintColor: Color.Purple }}
              accessories={[{ tag: row.reason }, { text: row.actor }, { date: new Date(row.time) }]}
              detail={
                <List.Item.Detail
                  markdown={`**${row.actor}** closed \`${project}#${row.issue}\` as ${row.reason}\n\n${row.message ?? ""}`}
                />
              }
              actions={actions}
            />
          ))}
        </List.Section>
      )}
      {specificProject && labels.data && (
        <List.Section title="Labels">
          {labels.data.map((entry) => (
            <List.Item
              key={entry.label}
              title={entry.label}
              icon={Icon.Tag}
              accessories={[{ text: String(entry.count) }]}
              actions={actions}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
