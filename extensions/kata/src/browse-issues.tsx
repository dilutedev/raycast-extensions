import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Detail,
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
import { Fragment, useMemo, useState } from "react";
import {
  Attention,
  Comment,
  EditableRelationKind,
  Issue,
  IssueDetail as IssueDetailData,
  PlanningDates,
  RelationKind,
  TitledIssueRef,
  addIssueLabel,
  addIssueRelation,
  assignIssue,
  claimIssue,
  closeIssue,
  commentIssue,
  deleteIssue,
  editIssue,
  listIssues,
  listProjectIssues,
  listProjects,
  moveIssue,
  notifyIssue,
  removeIssueLabel,
  removeIssueRelation,
  reopenIssue,
  setIssueAttention,
  setIssueDeadline,
  setIssuePriority,
  setIssueSchedule,
  showIssue,
  showPlanningDates,
  unassignIssue,
} from "./kata";
import { CreateIssueForm } from "./create-issue";
import { formatLocalDate, planningRows } from "./formatting";
import { matchesQuery, parseQuery } from "./issue-filter";
import { RELATION_TITLES, Relation, RelationRef, groupByParent, groupRelations, projectOf } from "./issue-relations";

type Status = "open" | "closed" | "all";

const SEARCH_HINT =
  "Tokens: label:<name> · owner:<name> · owner:none · p:<0-4> · p:<=<0-4> · is:ready. Other words match title, ref, project, owner, labels and priority.";

const PRIORITY_OPTIONS: { title: string; value: number | undefined }[] = [
  { title: "0 (Highest)", value: 0 },
  { title: "1", value: 1 },
  { title: "2", value: 2 },
  { title: "3", value: 3 },
  { title: "4 (Lowest)", value: 4 },
  { title: "No Priority", value: undefined },
];

export async function run(title: string, fn: () => Promise<unknown>, revalidate: () => void) {
  const toast = await showToast({ style: Toast.Style.Animated, title });
  try {
    await fn();
    toast.style = Toast.Style.Success;
    toast.title = `${title} – done`;
    revalidate();
    return true;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = `${title} – failed`;
    toast.message = e instanceof Error ? e.message : String(e);
    return false;
  }
}

function CommentForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`Comment on ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Comment"
            onSubmit={async (v: { body: string }) => {
              if (await run("Adding comment", () => commentIssue(issue.qualified_id, v.body), revalidate)) pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="body" title="Comment" enableMarkdown />
    </Form>
  );
}

function CloseForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`Close ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Close Issue"
            onSubmit={async (v: { reason: string; message: string; evidence: string }) => {
              if (
                await run(
                  "Closing issue",
                  () => closeIssue(issue.qualified_id, v.reason, v.message, v.evidence),
                  revalidate,
                )
              )
                pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="reason" title="Reason" defaultValue="done">
        <Form.Dropdown.Item value="done" title="Done" />
        <Form.Dropdown.Item value="wontfix" title="Won't Fix" />
        <Form.Dropdown.Item value="duplicate" title="Duplicate" />
        <Form.Dropdown.Item value="superseded" title="Superseded" />
      </Form.Dropdown>
      <Form.TextArea
        id="message"
        title="Message"
        info="kata requires a substantive message (about 60+ characters) describing scope and verification."
      />
      <Form.TextField
        id="evidence"
        title="Evidence"
        placeholder="commit:<sha>, pr:<url>, test:<cmd>, duplicate-of:<ref> …"
        info="Required for reason 'done'. Typed evidence as accepted by kata close --evidence."
      />
    </Form>
  );
}

function EditIssueForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  const [titleError, setTitleError] = useState<string>();
  return (
    <Form
      navigationTitle={`Edit ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Changes"
            onSubmit={async (v: { title: string; body: string }) => {
              const title = v.title.trim();
              if (!title) {
                setTitleError("Title is required");
                return;
              }
              const changes: { title?: string; body?: string } = {};
              if (title !== issue.title) changes.title = title;
              if (v.body !== issue.body) changes.body = v.body;
              if (changes.title === undefined && changes.body === undefined) {
                pop();
                return;
              }
              if (await run("Updating issue", () => editIssue(issue.qualified_id, changes), revalidate)) pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        defaultValue={issue.title}
        error={titleError}
        onChange={() => setTitleError(undefined)}
      />
      <Form.TextArea id="body" title="Description" defaultValue={issue.body} enableMarkdown />
    </Form>
  );
}

function OwnerForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  const [ownerError, setOwnerError] = useState<string>();
  return (
    <Form
      navigationTitle={`Set Owner of ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Set Owner"
            onSubmit={async (v: { owner: string }) => {
              const owner = v.owner.trim();
              if (!owner) {
                setOwnerError("Owner is required. Use Clear Owner to remove it.");
                return;
              }
              if (owner === issue.owner) {
                pop();
                return;
              }
              if (await run("Setting owner", () => assignIssue(issue.qualified_id, owner), revalidate)) pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="owner"
        title="Owner"
        placeholder="username"
        defaultValue={issue.owner ?? ""}
        error={ownerError}
        onChange={() => setOwnerError(undefined)}
      />
    </Form>
  );
}

function LabelsForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  const [current, setCurrent] = useState(issue.labels ?? []);
  return (
    <Form
      navigationTitle={`Labels of ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Labels"
            onSubmit={async (v: { labels: string }) => {
              const wanted = [
                ...new Set(
                  v.labels
                    .split(",")
                    .map((l) => l.trim())
                    .filter(Boolean),
                ),
              ];
              const toAdd = wanted.filter((l) => !current.includes(l));
              const toRemove = current.filter((l) => !wanted.includes(l));
              if (!toAdd.length && !toRemove.length) {
                pop();
                return;
              }
              let applied = current;
              const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
              const ok = await run(
                "Updating labels",
                async () => {
                  const failed: string[] = [];
                  for (const l of toAdd) {
                    try {
                      await addIssueLabel(issue.qualified_id, l);
                      applied = [...applied, l];
                    } catch (e) {
                      failed.push(`add "${l}": ${message(e)}`);
                    }
                  }
                  for (const l of toRemove) {
                    try {
                      await removeIssueLabel(issue.qualified_id, l);
                      applied = applied.filter((x) => x !== l);
                    } catch (e) {
                      failed.push(`remove "${l}": ${message(e)}`);
                    }
                  }
                  if (failed.length) throw new Error(failed.join("; "));
                },
                revalidate,
              );
              setCurrent(applied);
              if (ok) pop();
              else if (applied !== current) revalidate();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="labels"
        title="Labels"
        placeholder="comma, separated"
        defaultValue={current.join(", ")}
        info="Add or remove labels; changes are applied on submit."
      />
    </Form>
  );
}

function DateForm({
  issue,
  label,
  save,
  revalidate,
}: {
  issue: Issue;
  label: "Deadline" | "Schedule";
  save: (ref: string, date: string | undefined) => Promise<unknown>;
  revalidate: () => void;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`${label} for ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={`Set ${label}`}
            onSubmit={async (v: { date: Date | null }) => {
              if (!v.date) {
                await showToast({ style: Toast.Style.Failure, title: "Pick a date" });
                return;
              }
              const date = formatLocalDate(v.date);
              if (await run(`Setting ${label.toLowerCase()}`, () => save(issue.qualified_id, date), revalidate)) pop();
            }}
          />
          <Action
            title={`Clear ${label}`}
            icon={Icon.XMarkCircle}
            onAction={async () => {
              if (await run(`Clearing ${label.toLowerCase()}`, () => save(issue.qualified_id, undefined), revalidate))
                pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.DatePicker id="date" title={label} type={Form.DatePicker.Type.Date} />
    </Form>
  );
}

function AttentionForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  const currentAttention = issue.metadata?.["work.attention"];
  const currentMessage = issue.metadata?.["work.attention_msg"];
  return (
    <Form
      navigationTitle={`Attention for ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Set Attention"
            onSubmit={async (v: { attention: Attention; message: string }) => {
              const message = v.message.trim();
              if (
                await run(
                  "Setting attention",
                  () => setIssueAttention(issue.qualified_id, v.attention, message),
                  revalidate,
                )
              )
                pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="attention"
        title="Attention"
        defaultValue={typeof currentAttention === "string" ? currentAttention : "ok"}
      >
        <Form.Dropdown.Item value="ok" title="OK" />
        <Form.Dropdown.Item value="needs-human" title="Needs Human" />
        <Form.Dropdown.Item value="stuck" title="Stuck" />
      </Form.Dropdown>
      <Form.TextField
        id="message"
        title="Message"
        placeholder="one-line reason"
        defaultValue={typeof currentMessage === "string" ? currentMessage : ""}
      />
    </Form>
  );
}

function NotifyForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  const [recipientError, setRecipientError] = useState<string>();
  const [messageError, setMessageError] = useState<string>();
  return (
    <Form
      navigationTitle={`Notify about ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send Request"
            onSubmit={async (v: { to: string; message: string }) => {
              const recipient = v.to.trim();
              const message = v.message.trim();
              if (!recipient) setRecipientError("Recipient is required");
              if (!message) setMessageError("Message is required");
              if (!recipient || !message) return;
              if (await run("Sending request", () => notifyIssue(issue.qualified_id, recipient, message), revalidate))
                pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="to"
        title="To"
        placeholder="actor or actor/teammate"
        error={recipientError}
        onChange={() => setRecipientError(undefined)}
      />
      <Form.TextArea id="message" title="Message" error={messageError} onChange={() => setMessageError(undefined)} />
    </Form>
  );
}

function MoveForm({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  const { pop } = useNavigation();
  const { data: projects, isLoading } = useCachedPromise(listProjects);
  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Move ${issue.qualified_id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Move Issue"
            onSubmit={async (v: { project: string; single: boolean }) => {
              if (await run("Moving issue", () => moveIssue(issue.qualified_id, v.project, v.single), revalidate))
                pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="project" title="Project">
        {projects
          ?.filter((p) => p.name !== issue.project_name)
          .map((p) => (
            <Form.Dropdown.Item key={p.name} value={p.name} title={p.name} />
          ))}
      </Form.Dropdown>
      <Form.Checkbox id="single" label="Move only this issue, not its subtree" defaultValue={false} />
    </Form>
  );
}

async function confirmDelete(issue: Issue, revalidate: () => void) {
  const confirmed = await confirmAlert({
    title: `Delete ${issue.qualified_id}?`,
    message: "The issue is soft-deleted. You can bring it back with Restore Issue in Search Issues (Include Deleted).",
    primaryAction: { title: "Delete Issue", style: Alert.ActionStyle.Destructive },
  });
  if (confirmed) await run("Deleting issue", () => deleteIssue(issue.qualified_id), revalidate);
}

function planningActions({ issue, revalidate }: { issue: Issue; revalidate: () => void }) {
  return (
    <ActionPanel.Section>
      {issue.status === "open" && (
        <Action.Push
          title="Create Child Issue…"
          icon={Icon.PlusCircle}
          shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
          target={
            <CreateIssueForm
              initialProject={issue.project_name}
              initialParent={issue.qualified_id}
              onCreated={revalidate}
            />
          }
        />
      )}
      <Action.Push
        title="Set Deadline…"
        icon={Icon.Calendar}
        shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
        target={<DateForm issue={issue} label="Deadline" save={setIssueDeadline} revalidate={revalidate} />}
      />
      <Action.Push
        title="Schedule…"
        icon={Icon.Clock}
        shortcut={{ modifiers: ["cmd", "opt"], key: "s" }}
        target={<DateForm issue={issue} label="Schedule" save={setIssueSchedule} revalidate={revalidate} />}
      />
      <Action.Push
        title="Set Attention…"
        icon={Icon.Flag}
        shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
        target={<AttentionForm issue={issue} revalidate={revalidate} />}
      />
      <Action.Push
        title="Notify…"
        icon={Icon.Envelope}
        shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
        target={<NotifyForm issue={issue} revalidate={revalidate} />}
      />
    </ActionPanel.Section>
  );
}

function issueMarkdown(title: string, body: string, comments: Comment[]) {
  return (
    `# ${title}\n\n${body || "_No description._"}` +
    (comments.length
      ? `\n\n---\n\n## Comments\n\n` +
        comments.map((c) => `**${c.author}** · ${new Date(c.created_at).toLocaleString()}\n\n${c.body}`).join("\n\n")
      : "")
  );
}

type PlanningRow = ReturnType<typeof planningRows>[number];

function relationText({ qualified_id, title, status }: RelationRef) {
  return `${title ? `${qualified_id} – ${title}` : qualified_id}${status === "closed" ? " (closed)" : ""}`;
}

function statusIcon(status: RelationRef["status"]) {
  return status === "open"
    ? { source: Icon.Circle, tintColor: Color.Green }
    : { source: Icon.CheckCircle, tintColor: Color.Purple };
}

function groupedRelations(relations: Relation[]) {
  return (Object.keys(RELATION_TITLES) as RelationKind[])
    .map((kind) => ({ kind, items: relations.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length);
}

function RelationMetadata({ relations, planning }: { relations: Relation[]; planning: PlanningRow[] }) {
  return (
    <List.Item.Detail.Metadata>
      {planning.map((row) => (
        <List.Item.Detail.Metadata.Label key={row.title} title={row.title} text={row.text} />
      ))}
      {planning.length > 0 && relations.length > 0 && <List.Item.Detail.Metadata.Separator />}
      {groupedRelations(relations).map(({ kind, items }, g) => (
        <Fragment key={kind}>
          {g > 0 && <List.Item.Detail.Metadata.Separator />}
          {items.map(({ ref }, i) => (
            <List.Item.Detail.Metadata.Label
              key={`${kind}:${ref.qualified_id}`}
              title={i === 0 ? RELATION_TITLES[kind] : ""}
              text={relationText(ref)}
              icon={statusIcon(ref.status)}
            />
          ))}
        </Fragment>
      ))}
    </List.Item.Detail.Metadata>
  );
}

function DetailRelationMetadata({ relations, planning }: { relations: Relation[]; planning: PlanningRow[] }) {
  return (
    <Detail.Metadata>
      {planning.map((row) => (
        <Detail.Metadata.Label key={row.title} title={row.title} text={row.text} />
      ))}
      {planning.length > 0 && relations.length > 0 && <Detail.Metadata.Separator />}
      {groupedRelations(relations).map(({ kind, items }, g) => (
        <Fragment key={kind}>
          {g > 0 && <Detail.Metadata.Separator />}
          {items.map(({ ref }, i) => (
            <Detail.Metadata.Label
              key={`${kind}:${ref.qualified_id}`}
              title={i === 0 ? RELATION_TITLES[kind] : ""}
              text={relationText(ref)}
              icon={statusIcon(ref.status)}
            />
          ))}
        </Fragment>
      ))}
    </Detail.Metadata>
  );
}

function AddRelationForm({
  issueRef,
  parent,
  onChange,
}: {
  issueRef: string;
  parent?: TitledIssueRef;
  onChange: () => void;
}) {
  const { pop } = useNavigation();
  const { data: candidates, isLoading } = useCachedPromise(listProjectIssues, [projectOf(issueRef)]);
  const [kind, setKind] = useState<EditableRelationKind>("blocked-by");
  const [targetError, setTargetError] = useState<string>();
  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Add Relation to ${issueRef}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Relation"
            onSubmit={async (v: { kind: EditableRelationKind; target: string }) => {
              if (!v.target) {
                setTargetError("Select an issue");
                return;
              }
              if (await run("Adding relation", () => addIssueRelation(issueRef, v.kind, v.target), onChange)) pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="kind" title="Relation" value={kind} onChange={(v) => setKind(v as EditableRelationKind)}>
        <Form.Dropdown.Item value="blocked-by" title="Blocked By" />
        <Form.Dropdown.Item value="blocks" title="Blocks" />
        <Form.Dropdown.Item value="related" title="Related To" />
        <Form.Dropdown.Item value="parent" title="Parent" />
      </Form.Dropdown>
      {kind === "parent" && parent && (
        <Form.Description title="Note" text={`Replaces the current parent ${parent.qualified_id} – ${parent.title}.`} />
      )}
      <Form.Dropdown
        id="target"
        title="Issue"
        defaultValue=""
        error={targetError}
        onChange={() => setTargetError(undefined)}
      >
        <Form.Dropdown.Item value="" title="Select…" />
        {candidates
          ?.filter((i) => i.qualified_id !== issueRef)
          .map((i) => (
            <Form.Dropdown.Item
              key={i.uid}
              value={i.qualified_id}
              title={`${i.short_id} – ${i.title}`}
              keywords={[i.short_id]}
            />
          ))}
      </Form.Dropdown>
    </Form>
  );
}

function relationActions({
  issueRef,
  detail,
  titles,
  onChange,
}: {
  issueRef: string;
  detail: IssueDetailData | undefined;
  titles: ReadonlyMap<string, string>;
  onChange: () => void;
}) {
  if (!detail) return null;
  const groups = groupedRelations(groupRelations(detail, titles));
  const removable = groups.filter((g) => g.kind !== "child");
  return (
    <ActionPanel.Section>
      {groups.length > 0 && (
        <ActionPanel.Submenu
          title="Open Related Issue"
          icon={Icon.ArrowRight}
          shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        >
          {groups.map(({ kind, items }) => (
            <ActionPanel.Section key={kind} title={RELATION_TITLES[kind]}>
              {items.map(({ ref }) => (
                <Action.Push
                  key={`${kind}:${ref.qualified_id}`}
                  title={ref.title ? `${ref.qualified_id} – ${ref.title}` : ref.qualified_id}
                  icon={statusIcon(ref.status)}
                  target={<IssueView issueRef={ref.qualified_id} titles={titles} onChange={onChange} />}
                />
              ))}
            </ActionPanel.Section>
          ))}
        </ActionPanel.Submenu>
      )}
      <Action.Push
        title="Add Relation…"
        icon={Icon.Plus}
        shortcut={Keyboard.Shortcut.Common.New}
        target={<AddRelationForm issueRef={issueRef} parent={detail.parent} onChange={onChange} />}
      />
      {removable.length > 0 && (
        <ActionPanel.Submenu title="Remove Relation" icon={Icon.Trash} shortcut={Keyboard.Shortcut.Common.Remove}>
          {removable.map(({ kind, items }) => (
            <ActionPanel.Section key={kind} title={RELATION_TITLES[kind]}>
              {items.map(({ ref }) => (
                <Action
                  key={`${kind}:${ref.qualified_id}`}
                  title={ref.title ? `${ref.qualified_id} – ${ref.title}` : ref.qualified_id}
                  icon={statusIcon(ref.status)}
                  onAction={() =>
                    run(
                      "Removing relation",
                      () => removeIssueRelation(issueRef, kind as EditableRelationKind, ref.qualified_id),
                      onChange,
                    )
                  }
                />
              ))}
            </ActionPanel.Section>
          ))}
        </ActionPanel.Submenu>
      )}
    </ActionPanel.Section>
  );
}

export function IssueView({
  issueRef,
  titles,
  onChange,
}: {
  issueRef: string;
  titles: ReadonlyMap<string, string>;
  onChange: () => void;
}) {
  const { data, isLoading, revalidate } = useCachedPromise(showIssue, [issueRef]);
  const planningDates = useCachedPromise(showPlanningDates, [issueRef]);
  const relations = data ? groupRelations(data, titles) : [];
  const detailIssue = data && { ...data.issue, qualified_id: issueRef, project_name: projectOf(issueRef) };
  const planning = detailIssue ? planningRows(detailIssue, planningDates.data) : [];
  const changed = () => {
    revalidate();
    planningDates.revalidate();
    onChange();
  };
  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={issueRef}
      markdown={data ? issueMarkdown(data.issue.title, data.issue.body, data.comments) : ""}
      metadata={
        relations.length || planning.length ? (
          <DetailRelationMetadata relations={relations} planning={planning} />
        ) : undefined
      }
      actions={
        <ActionPanel>
          {data?.web_url && <Action.OpenInBrowser title="Open in Kata Web UI" url={data.web_url} />}
          <Action.CopyToClipboard
            title="Copy Reference"
            content={issueRef}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          {detailIssue && planningActions({ issue: detailIssue, revalidate: changed })}
          {relationActions({ issueRef, detail: data, titles, onChange: changed })}
        </ActionPanel>
      }
    />
  );
}

function IssueDetail({
  issue,
  detail,
  planningDates,
  isLoading,
  titles,
}: {
  issue: Issue;
  detail: IssueDetailData | undefined;
  planningDates: PlanningDates | undefined;
  isLoading: boolean;
  titles: ReadonlyMap<string, string>;
}) {
  const relations = detail ? groupRelations(detail, titles) : [];
  const planning = planningRows(detail ? { ...issue, metadata: detail.issue.metadata } : issue, planningDates);
  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={issueMarkdown(issue.title, issue.body, detail?.comments ?? [])}
      metadata={
        relations.length || planning.length ? <RelationMetadata relations={relations} planning={planning} /> : undefined
      }
    />
  );
}

export default function Command() {
  return <IssueList />;
}

function IssueList({ parent }: { parent?: Issue }) {
  const [status, setStatus] = useState<Status>("open");
  const [project, setProject] = useState("all");
  const [searchText, setSearchText] = useState("");
  const { data, isLoading, revalidate } = useCachedPromise(listIssues, [status]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const show = useCachedPromise(showIssue, [selectedId ?? ""], { execute: !!selectedId });
  const planningDates = useCachedPromise(showPlanningDates, [selectedId ?? ""], { execute: !!selectedId });
  const changed = () => {
    revalidate();
    show.revalidate();
    planningDates.revalidate();
  };

  const projects = [...new Set(data?.map((i) => i.project_name))].sort();
  const query = useMemo(() => parseQuery(searchText), [searchText]);
  const titles = useMemo(() => new Map((data ?? []).map((i) => [i.qualified_id, i.title])), [data]);
  const { roots, children } = useMemo(() => groupByParent(data ?? []), [data]);
  // Top level lists parents only; searching or drilling into a parent shows a flat list.
  const candidates = parent ? (children.get(parent.uid) ?? []) : searchText.trim() ? (data ?? []) : roots;
  const issues = candidates.filter((i) => (project === "all" || i.project_name === project) && matchesQuery(i, query));

  return (
    <List
      navigationTitle={parent ? `Children of ${parent.qualified_id}` : undefined}
      isLoading={isLoading}
      isShowingDetail
      onSelectionChange={setSelectedId}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Filter issues… label:x owner:x|none p:1 p:<=1 is:ready"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter"
          storeValue
          onChange={(v) => (v.startsWith("status:") ? setStatus(v.slice(7) as Status) : setProject(v.slice(8)))}
        >
          <List.Dropdown.Section title="Status">
            <List.Dropdown.Item title="Open" value="status:open" />
            <List.Dropdown.Item title="Closed" value="status:closed" />
            <List.Dropdown.Item title="All" value="status:all" />
          </List.Dropdown.Section>
          <List.Dropdown.Section title="Project">
            <List.Dropdown.Item title="All Projects" value="project:all" />
            {projects.map((p) => (
              <List.Dropdown.Item key={p} title={p} value={`project:${p}`} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {!isLoading && searchText.trim() !== "" && (
        <List.EmptyView
          icon={query.ready && status === "closed" ? Icon.Filter : Icon.MagnifyingGlass}
          title={query.ready && status === "closed" ? "Ready only applies to open issues" : "No matching issues"}
          description={
            query.ready && status === "closed" ? "Switch the status to Open or All to use is:ready." : SEARCH_HINT
          }
        />
      )}
      {issues.map((issue) => (
        <List.Item
          key={issue.uid}
          id={issue.qualified_id}
          title={issue.title}
          subtitle={issue.qualified_id}
          icon={
            issue.status === "open"
              ? { source: Icon.Circle, tintColor: Color.Green }
              : { source: Icon.CheckCircle, tintColor: Color.Purple }
          }
          accessories={[
            ...(children.has(issue.uid) ? [{ icon: Icon.List, text: String(children.get(issue.uid)?.length) }] : []),
            ...(issue.priority !== undefined ? [{ tag: `P${issue.priority}` }] : []),
            ...(issue.owner ? [{ icon: Icon.Person, text: issue.owner }] : []),
          ]}
          detail={
            <IssueDetail
              issue={issue}
              detail={selectedId === issue.qualified_id ? show.data : undefined}
              planningDates={selectedId === issue.qualified_id ? planningDates.data : undefined}
              isLoading={selectedId === issue.qualified_id && show.isLoading}
              titles={titles}
            />
          }
          actions={
            <ActionPanel>
              {children.has(issue.uid) && (
                <Action.Push
                  title="View Children"
                  icon={Icon.List}
                  shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
                  target={<IssueList parent={issue} />}
                />
              )}
              <Action.OpenInBrowser title="Open in Kata Web UI" url={issue.web_url} />
              <Action.CopyToClipboard
                title="Copy Reference"
                content={issue.qualified_id}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              {issue.status === "open" ? (
                <>
                  <Action
                    title="Claim Issue"
                    icon={Icon.Person}
                    shortcut={{ modifiers: ["cmd"], key: "l" }}
                    onAction={() => run("Claiming issue", () => claimIssue(issue.qualified_id), revalidate)}
                  />
                  <Action.Push
                    title="Close Issue…"
                    icon={Icon.CheckCircle}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
                    target={<CloseForm issue={issue} revalidate={revalidate} />}
                  />
                </>
              ) : (
                <Action
                  title="Reopen Issue"
                  icon={Icon.ArrowCounterClockwise}
                  onAction={() => run("Reopening issue", () => reopenIssue(issue.qualified_id), revalidate)}
                />
              )}
              <Action.Push
                title="Add Comment…"
                icon={Icon.Bubble}
                shortcut={{ modifiers: ["cmd"], key: "m" }}
                target={<CommentForm issue={issue} revalidate={revalidate} />}
              />
              <Action.Push
                title="Edit Issue…"
                icon={Icon.Pencil}
                shortcut={Keyboard.Shortcut.Common.Edit}
                target={<EditIssueForm issue={issue} revalidate={revalidate} />}
              />
              <ActionPanel.Submenu
                title="Set Priority"
                icon={Icon.Exclamationmark}
                shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <Action
                    key={o.title}
                    title={o.title}
                    icon={o.value === issue.priority ? Icon.Checkmark : undefined}
                    onAction={() => {
                      if (o.value === issue.priority) return;
                      run("Setting priority", () => setIssuePriority(issue.qualified_id, o.value), revalidate);
                    }}
                  />
                ))}
              </ActionPanel.Submenu>
              <Action.Push
                title="Set Owner…"
                icon={Icon.Person}
                shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
                target={<OwnerForm issue={issue} revalidate={revalidate} />}
              />
              {issue.owner && (
                <Action
                  title="Clear Owner"
                  icon={Icon.PersonCircle}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
                  onAction={() => run("Clearing owner", () => unassignIssue(issue.qualified_id), revalidate)}
                />
              )}
              <Action.Push
                title="Edit Labels…"
                icon={Icon.Tag}
                shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
                target={<LabelsForm issue={issue} revalidate={revalidate} />}
              />
              {planningActions({ issue, revalidate: changed })}
              <ActionPanel.Section>
                <Action.Push
                  title="Move to Project…"
                  icon={Icon.ArrowRight}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
                  target={<MoveForm issue={issue} revalidate={changed} />}
                />
                <Action
                  title="Delete Issue"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.RemoveAll}
                  onAction={() => confirmDelete(issue, changed)}
                />
              </ActionPanel.Section>
              {relationActions({
                issueRef: issue.qualified_id,
                detail: selectedId === issue.qualified_id ? show.data : undefined,
                titles,
                onChange: changed,
              })}
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
