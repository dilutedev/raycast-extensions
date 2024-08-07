import { Action, ActionPanel, Icon, List } from "@raycast/api";
import React from "react";
import { ActionConfigureCommand } from "./action-configure-command";

export function FolderPageListEmptyView(props: { path: string; pop: () => void }) {
  const { path, pop } = props;
  return (
    <List.EmptyView
      icon={{ source: { light: "empty-view-icon.png", dark: "empty-view-icon@dark.png" } }}
      title={"No Files"}
      actions={
        <ActionPanel>
          <Action.Open title="Open" target={path} />
          <Action.ShowInFinder path={path} />

          <Action
            icon={Icon.ChevronUp}
            title={"Enclosing Folder"}
            shortcut={{ modifiers: ["cmd", "opt"], key: "arrowUp" }}
            onAction={pop}
          />
          <ActionConfigureCommand />
        </ActionPanel>
      }
    />
  );
}
