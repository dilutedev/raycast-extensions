# Kata

Browse, filter, create and manage issues in [kata](https://katatracker.com), the local-first issue tracker for humans and coding agents.

## Requirements

This extension drives the `kata` command-line tool, so it must be installed first:

```sh
brew install kata
```

Kata runs a local daemon that the CLI talks to. If commands fail with a connection error, start it with `kata daemon start`.

By default the extension uses `/opt/homebrew/bin/kata` (Apple silicon Homebrew). On an Intel Mac, or if you installed kata elsewhere, set the **Kata Binary** preference to the path printed by `which kata`. Leaving it empty uses `kata` from your `PATH`.

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

### Kata Admin

Read-only views of cron jobs, runs and workflows (per project), teams, tokens, your identity and daemon health. Items are shown as JSON.

## Remote Server

To use a kata daemon on another machine (for example over Tailscale), create an identity token on the server:

```sh
kata tokens create --actor <name> --name macbook
```

Then set **Server URL** (for example `http://100.x.y.z:7777`) and **Auth Token** in the extension preferences. **Actor** optionally sets the author of your changes and which inbox is shown. Leave all three empty to use the local daemon.

## Preferences

| Preference | Description |
| --- | --- |
| Kata Binary | Path to the kata executable. Defaults to `/opt/homebrew/bin/kata`; leave empty to use `kata` from your `PATH`. |
| Server URL | Remote kata daemon URL, passed to kata as `KATA_SERVER`. Leave empty for the local daemon. |
| Auth Token | Identity token for the remote daemon, passed as `KATA_AUTH_TOKEN`. |
| Actor | Your actor name, passed as `KATA_AUTHOR`. |
