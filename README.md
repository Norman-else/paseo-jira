# Paseo Jira

A [Paseo](https://paseo.sh) plugin that turns Jira tickets into running coding agents.

- **Jira page** in the sidebar: tickets from your sprints, grouped by sprint, with a sprint switcher,
  an "Only mine" filter and search. Each ticket has a **Start** button.
- **Start modal**: edit the prompt, pick the project and model, and optionally run in a fresh git
  worktree branched off a remote branch of your choice (defaults to the remote default branch).
- **Composer attachment**: on the New Workspace screen, use **+ → Jira ticket** to attach a ticket
  to the first message.

The prompt only contains the ticket link and the branch name (the ticket key):

```
Implement Jira ticket https://your-site.atlassian.net/browse/ABC-123. Use branch name ABC-123.
```

The agent is expected to read the ticket itself (e.g. through a Jira MCP server).

## Requirements

- Paseo `>= 0.13.2` with **Settings → Plugins → Enable plugins** turned on
- Jira Cloud (`*.atlassian.net`) with an [API token](https://id.atlassian.com/manage-profile/security/api-tokens)
- `git` on the daemon host (for worktree mode)

## Install

From GitHub:

```bash
paseo plugin add git:Norman-else/paseo-jira
paseo plugin update paseo-jira   # later, to pull new commits
```

From a local checkout (for development):

```bash
git clone https://github.com/Norman-else/paseo-jira.git
cd paseo-jira
npm install                       # dev dependencies for typecheck/tests only
paseo plugin add "$(pwd)"
```

Check it is running with `paseo plugin ls`; see errors with `paseo plugin logs paseo-jira`.

You can also use **Settings → Plugins → Jira → Plugin updates → Check updates** to check for and install updates. The action uses the host update API when available and falls back to the Paseo CLI. Directory installations must be updated from their source checkout and reloaded.

## Configure

Open **Settings → Plugins → Jira**:

1. Fill in **Jira URL**, **Email** and **API token**, press **Save**, then **Test**.
2. Under **Sprint boards**, switch on the boards whose sprints you want in the sprint switcher.
3. **Default JQL** is used by the composer attachment search when the search box is empty.

Settings are stored on the Paseo daemon and are readable by every client connected to it.

## Usage

**Jira page** — open **Jira** in the sidebar.

- Sprint switcher: *All active sprints* (of the selected boards) or a single active/upcoming sprint.
- *Only mine* limits the list to tickets assigned to you.
- Search by text within the current sprint, or type a ticket key (`ABC-123`) to jump to it.
- Click a ticket to expand its description, metadata, labels and components in place; details load on first expand. Use **Open in Jira** inside the expanded ticket to open the original issue, or **Start** to launch an agent.

**Start modal**

| Field        | Behavior                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| Prompt       | Prefilled with the ticket link and branch name; editable.                                 |
| Project      | Git projects known to Paseo.                                                              |
| Model        | All models of the available providers, grouped by provider, searchable.                   |
| Use worktree | Off: the agent works in the project directory. On: `git fetch`, then a new worktree on branch `<KEY>` from the chosen **Base branch**. |

## Development

```bash
npm run typecheck
npm test
paseo plugin reload paseo-jira    # apply source changes
```

```
index.client.tsx      registers the screen, sidebar item, settings screen and attachment source
index.server.ts       registers daemon-side RPC handlers and settings
client/               React Native UI (runs on desktop, web and mobile)
server/               Jira REST/Agile API client, JQL builders, git helpers (Node)
shared/               settings schema and RPC contracts used by both sides
```

Jira calls run in the daemon, so the API token never reaches client code.
