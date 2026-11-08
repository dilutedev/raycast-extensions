import { AdminItem, DigestTotals, Issue, PlanningDates } from "./kata";

export function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTotals(totals: DigestTotals): string[] {
  return Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([action, count]) => `${count} ${action.replace(/_/g, " ")}`);
}

export function windowStart(hours: number, now: Date): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
}

export function planningRows(issue: Issue, dates: PlanningDates | undefined): { title: string; text: string }[] {
  const rows: { title: string; text: string }[] = [];
  if (dates?.deadline_on) rows.push({ title: "Deadline", text: dates.deadline_on });
  if (dates?.scheduled_on) rows.push({ title: "Scheduled", text: dates.scheduled_on });
  const attention = issue.metadata?.["work.attention"];
  if (typeof attention === "string" && attention) {
    const message = issue.metadata?.["work.attention_msg"];
    rows.push({
      title: "Attention",
      text: typeof message === "string" && message ? `${attention} – ${message}` : attention,
    });
  }
  return rows;
}

export function adminItemTitle(item: AdminItem): string {
  for (const key of ["name", "title", "label", "uid", "run_uid", "id"]) {
    const value = item[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "Untitled";
}

export function jsonMarkdown(value: unknown): string {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}
