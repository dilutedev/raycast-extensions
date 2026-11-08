# Kata

Browse, filter, create and manage issues in [kata](https://katatracker.com), the local-first issue tracker for humans and coding agents.

## Setup

The extension talks to the kata daemon's HTTP API directly, so kata does not need to be installed on your Mac. On first launch, any command shows the **Add Connection** form. Fill in:

- **Name**: a label for this server, for example `Personal`.
- **Server URL**: the address of the kata daemon, for example `http://100.x.y.z:7777` over Tailscale.
- **Auth Token** (optional): leave it empty if the daemon allows tokenless private-network access (`allow_unauthenticated_private_network_writes = true`). Otherwise use an identity token, created on the server with:

```sh
kata tokens create --actor <name> --name <label>
```

- **Actor** (optional): set it when you connect without a token, because the daemon then records changes under this name. With a token it is only needed if the server does not report the token's actor. It is used for the Inbox recipient, the sender of Notify requests, Clear Request and as the author of changes.

The connection is tested before it is saved. **Save Without Testing** skips the check.

### Multiple connections

You can save several connections, for example your own server and a team's server, and use one at a time. The first connection you add becomes active. Switch with **Switch Connection** in any command's action panel (`⌘⌃S`), or from **Manage Connections**, where you can also add, edit, test and delete connections. Each command shows the active connection in its title, and data is never shared between connections.

Connections, including auth tokens, are stored in Raycast's local storage on your Mac.

## Commands

### Browse Issues

A list of issues across all kata projects, with a detail pane showing the body and comments.

- Use the dropdowns to filter by status (Open, Closed, All) and project.
- Type in the search bar to filter. It understands `label:x`, `owner:x` (or `owner:none`), `p:1`, `p:<=1` and `is:ready`; any other words must all match the title, issue ID, project, owner or labels.
- Parents show a child count; **View Children** drills into their sub-issues, and **Create Child Issue…** pre-fills the create form with the project and parent.
- The detail pane shows relations (parent, children, blocked-by, blocks, related) plus the deadline, schedule and attention values when set.
- Actions: Open in Kata Web UI, Copy Reference, Claim, Close, Reopen, Add Comment, Edit Issue, Set Priority, Set Owner, Clear Owner, Edit Labels, Set Deadline, Schedule (both can be cleared), Set Attention, Notify, Move to Project, Delete Issue (soft delete, asks for confirmation), Open Related Issue, Add Relation, Remove Relation (parent, blocked-by, blocks and related issues) and Refresh.

### Create Issue

A form to create an issue in any kata project: title, body, priority, labels, owner, parent and blocked-by. Choose **Create Issue**, or **Create and Open in Web UI** to jump straight to the new issue.

### Inbox

Attention requests addressed to you across all projects. Open the issue, or **Clear Request** once handled.

### Ready Issues

Open issues that nothing blocks and that are not scheduled for the future, across all projects, with the single next issue to work on pinned at the top. Open, claim, copy the reference or open the web UI.

### Search Issues

Full-text search over titles, bodies and comments in the project chosen in the dropdown. Shows where each result matched, can filter by status, and can include deleted issues, which you can restore with **Restore Issue**.

### Activity

Digest of what changed in the last 24 hours or 7 days (switch with **Show Last 7 Days**), per-actor summaries, and, when a single project is selected, its recent closes and label counts.

### Manage Connections

Add, edit, test, delete and switch between saved kata servers.

### Kata Admin

Read-only views of cron jobs, runs and workflows (per project), teams, tokens, your identity and daemon health. Items are shown as JSON.
