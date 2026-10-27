# Paseo Jira plugin — design

Date: 2026-10-27

## Intent

Turn a Jira ticket into a running coding agent in one or two clicks from inside Paseo. The user
finds a ticket, presses Start, and an agent begins implementing it on a branch named after the
ticket. The agent fetches ticket details itself (it has Jira access via its own MCP), so the
plugin only hands over the ticket link.

## Goals

- A Jira screen reachable from the sidebar header list (the row with 历史 / 搜索 / 计划), showing a
  searchable ticket list with a Start button per row.
- Start opens a modal: editable prompt, workspace picker, worktree on/off, confirm.
- A Jira attachment source in the composer, so on the New Workspace screen the user can attach a
  ticket and press Paseo's own create button.
- A settings screen for the Jira connection.

## Non-goals

- No ticket detail view, no editing/transitioning/commenting on tickets.
- No provider/model picker in the modal — Paseo's default provider is used.
- No ticket-to-repo mapping; the user picks the workspace each time.
- No Jira Server / Data Center support; Jira Cloud only.

## Anti-goals

- The prompt must not grow beyond the ticket link and branch instruction (the user explicitly
  wants it minimal; the agent queries Jira itself).
- Jira credentials must never reach client code or logs; all Jira calls happen in the daemon.

## Platform (verified against getpaseo/paseo main, `public-docs/plugins/*`, `public-docs/sdk/*`)

Paseo plugin = TypeScript project, scaffolded with `paseo plugin init <abs-dir>`, with
`index.client.tsx` (app, also mobile — React Native, no DOM), `index.server.ts` (daemon
subprocess, Node), and `client/`, `server/`, `shared/` dirs enforced as compile boundaries.
Paseo supplies `@getpaseo/plugin`, React, React Native, TanStack Query, Zod at runtime.

APIs this design relies on:

| Need | API |
|---|---|
| Screen | `client.addScreen({ id, title, Component })` |
| Sidebar header entry | `client.addSidebarHeaderItem({ id, title, Component })` rendering `SidebarRow` from `@getpaseo/plugin/client/ui`, `onPress={() => openScreen(...)}` |
| Settings screen | `client.addSettingsScreen({ id, title, icon, Component })`; values via `defineSettings` (shared) + `server.registerSettings` + `useSettings` |
| Daemon RPC | `defineRpc` (shared), `server.handle(rpc, fn)`, `useRpc` (client) |
| Modal | `Modal` / `Modal.Content` from `@getpaseo/plugin/client/ui` |
| Composer attachment | `defineAttachmentSource({ id, title, icon, pickerTitle, searchPlaceholder, search: rpc })` + `client.addAttachmentSource`; the New Workspace screen's composer already renders plugin attachment sources (`packages/app/src/screens/new-workspace-screen.tsx` → `usePluginAttachmentPicker`) |
| Workspace list | `paseo.workspaces.list()` |
| Agent in existing workspace | `paseo.workspaces.ref(id).agents.create({ prompt })` |
| Worktree + agent | `paseo.workspaces.create({ source: { kind: "worktree", cwd, action: "branch-off", refName, branchName }, title, agent: { cwd, prompt } })` |

## Settings (scope `host`)

- `baseUrl` — e.g. `https://xxx.atlassian.net`
- `email`
- `apiToken` — Jira Cloud API token; auth is HTTP Basic `email:apiToken`
- `defaultJql` — default `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`
  (builder's call on exact default)

Settings screen has a "Test connection" button calling an RPC that hits `GET /rest/api/3/myself`.

Note: host-scoped settings are readable by every client connected to that daemon. Acceptable for
single-user use; the settings UI should not echo the token back in plain text (mask it).

## Daemon RPCs

- `jira.search({ query })` → `{ items: [{ key, summary, status, assignee?, url }] }`
  - Empty `query` → run `defaultJql`.
  - Query that looks like a key (`/^[A-Z][A-Z0-9]+-\d+$/i`) → `key = <query>`.
  - Otherwise → `text ~ "<query>" AND (<defaultJql without ORDER BY>)` or just `text ~` — builder's call.
  - Uses Jira Cloud `POST /rest/api/3/search/jql` (the old `/rest/api/3/search` is deprecated).
  - Returns clear errors for missing settings / 401 / network failure; the UI shows them.
- `jira.testConnection()` → ok / error message.
- `git.prepareBase({ cwd })` → `{ refName }`: runs `git fetch origin` in the repo, resolves the
  remote default branch (`git symbolic-ref refs/remotes/origin/HEAD`, falling back to `origin/main`,
  then `origin/master`), returns e.g. `origin/main`. Needed because Paseo's own default-branch
  resolution does not fetch first, and the user wants the worktree based on the latest remote main.

The attachment source reuses `jira.search`, mapping each item to the attachment shape with
`text` = the default prompt (see below) — i.e. key + link only.

## Jira screen (entry 1)

- Sidebar header row "Jira" opens it.
- Search box; empty on open → shows `defaultJql` results.
- Each row: key, summary, status; Start button.
- If settings are missing, show a message with a button that calls `openSettings(...)`.

## Start modal

Fields:

1. **Prompt** (multiline, prefilled, editable). Default:
   `Implement Jira ticket <url>. Use branch name <KEY>.`
   Nothing else.
2. **Workspace** — picker over `paseo.workspaces.list()`.
3. **Use worktree** — switch, default off (builder's call on default).
4. **Start** button.

On Start:

- **Worktree off:** `workspaces.ref(id).agents.create({ prompt })`. The agent works directly in that
  workspace's directory and creates/switches to branch `<KEY>` itself per the prompt.
- **Worktree on:** call `git.prepareBase({ cwd: workspace.directory })`, then
  `workspaces.create({ source: { kind: "worktree", cwd: workspace.directory, action: "branch-off",
  refName, branchName: KEY }, title: "<KEY> <summary>", agent: { cwd: workspace.directory, prompt } })`.
  (The `agent.cwd` value in the worktree case must be verified against the SDK; the doc example
  passes the source dir.)
- Close modal, then navigate to the new agent if the plugin API offers a way; otherwise show a
  toast. Builder to verify what navigation the client context provides.
- Errors (branch already exists, fetch fails, not a git repo) shown inline in the modal; modal
  stays open.

## Composer attachment (entry 2)

`defineAttachmentSource({ id: "jira", title: "Jira ticket", icon: "Ticket", pickerTitle: "Attach
Jira ticket", searchPlaceholder: "Key or text", search: jiraSearch })`. Paseo owns the picker, pill,
and submit. The user picks the repo/worktree mode using Paseo's own New Workspace controls; the
plugin does nothing else here.

## Left to the builder

- File layout inside `client/` / `server/` / `shared/`.
- Exact default JQL and text-search JQL.
- Visual details, using `theme.colors` and `layout.compact` so it works on mobile.
- Verification: `npm run typecheck`, unit test for the JQL builder and key detection, and a
  manual run via `paseo plugin add <abs-dir>` + `paseo plugin reload`.
