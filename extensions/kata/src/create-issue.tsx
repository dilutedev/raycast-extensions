import { Action, ActionPanel, Form, Icon, Toast, open, popToRoot, showToast, useNavigation } from "@raycast/api";
import { useCachedPromise, useLocalStorage } from "@raycast/utils";
import { useEffect, useState } from "react";
import { createIssue, listProjectIssues, listProjects } from "./kata";
import { ConnectionGate, useActiveConnection } from "./connection-ui";

interface Values {
  project: string;
  title: string;
  body: string;
  priority: string;
  labels: string;
  owner: string;
  parent: string;
  blockedBy: string[];
}

export default function Command() {
  return (
    <ConnectionGate>
      <CreateIssueForm />
    </ConnectionGate>
  );
}

export function CreateIssueForm({
  initialProject,
  initialParent,
  onCreated,
}: {
  initialProject?: string;
  initialParent?: string;
  onCreated?: () => void;
}) {
  const { pop } = useNavigation();
  const { connections, connection: activeConnection } = useActiveConnection();
  const [connectionId, setConnectionId] = useState<string>();
  const selectedConnection = connections.find((candidate) => candidate.id === connectionId) ?? activeConnection;
  const { data: projects, isLoading } = useCachedPromise(
    (id: string) => listProjects(connections.find((candidate) => candidate.id === id)),
    [selectedConnection?.id ?? ""],
    { execute: !!selectedConnection },
  );
  const {
    value: lastProject,
    setValue: setLastProject,
    isLoading: isLoadingLastProject,
  } = useLocalStorage<string>("lastProject");
  const [project, setProject] = useState<string | undefined>(initialProject);
  const [parent, setParent] = useState(initialParent ?? "");
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string>();

  const { data: candidates, isLoading: isLoadingCandidates } = useCachedPromise(
    (_connectionId: string, projectName: string) => listProjectIssues(projectName, selectedConnection),
    [selectedConnection?.id ?? "", project as string],
    { execute: !!project && !!selectedConnection },
  );

  useEffect(() => {
    if (project !== undefined || !projects?.length || isLoadingLastProject) return;
    setProject(projects.some((p) => p.name === lastProject) ? lastProject : projects[0].name);
  }, [projects, lastProject, isLoadingLastProject, project]);

  function changeConnection(value: string) {
    if (value === selectedConnection?.id) return;
    setConnectionId(value);
    setProject(undefined);
    setParent("");
    setBlockedBy([]);
  }

  function changeProject(value: string) {
    if (project === undefined || value === project) return;
    setProject(value);
    setParent("");
    setBlockedBy([]);
  }

  async function submit(values: Values, openInBrowser: boolean) {
    if (!values.title.trim()) {
      setTitleError("Title is required");
      return;
    }
    const toast = await showToast({ style: Toast.Style.Animated, title: "Creating issue" });
    const labels = values.labels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    let uid: string;
    let webUrl: string | undefined;
    try {
      const res = await createIssue(
        {
          project: values.project,
          title: values.title,
          body: values.body,
          priority: values.priority,
          labels,
          owner: values.owner.trim(),
          parent,
          blockedBy,
        },
        selectedConnection,
      );
      uid = res.issue.uid;
      webUrl = res.web_url;
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to create issue";
      toast.message = e instanceof Error ? e.message : String(e);
      return;
    }
    await setLastProject(values.project);
    toast.style = Toast.Style.Success;
    toast.title = "Issue created";
    if (openInBrowser) {
      try {
        const url =
          webUrl ?? (await listProjectIssues(values.project, selectedConnection)).find((i) => i.uid === uid)?.web_url;
        if (url) await open(url);
      } catch (e) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Issue created, but couldn't open it",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (onCreated) {
      onCreated();
      pop();
    } else {
      await popToRoot();
    }
  }

  return (
    <Form
      isLoading={isLoading || isLoadingCandidates}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Issue" onSubmit={(v: Values) => submit(v, false)} />
          <Action.SubmitForm
            title="Create and Open in Web UI"
            icon={Icon.Globe}
            onSubmit={(v: Values) => submit(v, true)}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="connection"
        title="Connection"
        value={selectedConnection?.id ?? ""}
        onChange={changeConnection}
      >
        {connections.map((candidate) => (
          <Form.Dropdown.Item key={candidate.id} value={candidate.id} title={candidate.name} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="project" title="Project" value={project ?? ""} onChange={changeProject}>
        {project !== undefined &&
          projects?.map((p) => <Form.Dropdown.Item key={p.name} value={p.name} title={p.name} />)}
      </Form.Dropdown>
      <Form.TextField
        id="title"
        title="Title"
        error={titleError}
        onChange={(v) => {
          if (titleError && v.trim()) setTitleError(undefined);
        }}
      />
      <Form.TextArea id="body" title="Body" enableMarkdown />
      <Form.Dropdown id="priority" title="Priority" defaultValue="">
        <Form.Dropdown.Item value="" title="Default" />
        <Form.Dropdown.Item value="0" title="0 (Highest)" />
        <Form.Dropdown.Item value="1" title="1" />
        <Form.Dropdown.Item value="2" title="2" />
        <Form.Dropdown.Item value="3" title="3" />
        <Form.Dropdown.Item value="4" title="4 (Lowest)" />
      </Form.Dropdown>
      <Form.TextField id="labels" title="Labels" placeholder="comma, separated" />
      <Form.TextField id="owner" title="Owner" placeholder="unassigned" />
      <Form.Dropdown id="parent" title="Parent" value={parent} onChange={setParent}>
        <Form.Dropdown.Item value="" title="None" />
        {candidates?.map((i) => (
          <Form.Dropdown.Item
            key={i.uid}
            value={i.qualified_id}
            title={`${i.short_id} – ${i.title}`}
            keywords={[i.short_id]}
          />
        ))}
      </Form.Dropdown>
      <Form.TagPicker id="blockedBy" title="Blocked By" value={blockedBy} onChange={setBlockedBy}>
        {candidates?.map((i) => (
          <Form.TagPicker.Item key={i.uid} value={i.qualified_id} title={`${i.short_id} – ${i.title}`} />
        ))}
      </Form.TagPicker>
    </Form>
  );
}
