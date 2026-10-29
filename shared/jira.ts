import { defineAttachmentSource, defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const OLD_DEFAULT_JQL = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

export const jiraSettings = defineSettings({
  id: "connection",
  scope: "host",
  version: 2,
  // v2: default JQL moved to the active sprint; keep any JQL the user customised.
  migrate: (values: unknown) => {
    const v = (values ?? {}) as Record<string, unknown>;
    return v.defaultJql === OLD_DEFAULT_JQL ? { ...v, defaultJql: undefined } : v;
  },
  schema: z.object({
    baseUrl: z.string().trim().default(""),
    email: z.string().trim().default(""),
    apiToken: z.string().trim().default(""),
    defaultJql: z
      .string()
      .trim()
      .default("sprint in openSprints() AND assignee = currentUser() ORDER BY status ASC, updated DESC"),
    boardIds: z.array(z.number()).default([]),
  }),
});

export const searchTicketsRpc = defineRpc({
  name: "jira.search",
  input: z.object({ query: z.string() }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        subtitle: z.string().optional(),
        url: z.url(),
        text: z.string(),
        resourceType: z.string(),
      }),
    ),
  }),
});

const SprintSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.string(),
  boardName: z.string().optional(),
});
export type Sprint = z.infer<typeof SprintSchema>;

export const listTicketsRpc = defineRpc({
  name: "jira.list",
  input: z.object({ query: z.string(), sprintId: z.number().nullable(), mine: z.boolean(), showDone: z.boolean() }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        title: z.string(),
        url: z.string(),
        status: z.string(),
        statusCategory: z.string(),
        assignee: z.string().nullable(),
        sprint: SprintSchema.nullable(),
      }),
    ),
  }),
});

export const ticketDetailsRpc = defineRpc({
  name: "jira.ticket",
  input: z.object({ key: z.string() }),
  output: z.object({
    key: z.string(),
    title: z.string(),
    url: z.string(),
    description: z.string(),
    type: z.string(),
    priority: z.string(),
    status: z.string(),
    statusCategory: z.string(),
    assignee: z.string().nullable(),
    reporter: z.string().nullable(),
    created: z.string().nullable(),
    updated: z.string().nullable(),
    labels: z.array(z.string()),
    components: z.array(z.string()),
  }),
});

export const listSprintsRpc = defineRpc({
  name: "jira.sprints",
  input: z.object({}),
  output: z.object({ sprints: z.array(SprintSchema) }),
});

export const listBoardsRpc = defineRpc({
  name: "jira.boards",
  input: z.object({}),
  output: z.object({ boards: z.array(z.object({ id: z.number(), name: z.string(), project: z.string().nullable() })) }),
});

export const listTransitionsRpc = defineRpc({
  name: "jira.transitions",
  input: z.object({ key: z.string() }),
  output: z.object({
    transitions: z.array(z.object({ id: z.string(), name: z.string(), to: z.string(), toCategory: z.string() })),
  }),
});

export const transitionRpc = defineRpc({
  name: "jira.transition",
  input: z.object({ key: z.string(), transitionId: z.string() }),
  output: z.object({ ok: z.literal(true) }),
});

export const searchAssigneesRpc = defineRpc({
  name: "jira.assignees",
  input: z.object({ key: z.string(), query: z.string() }),
  output: z.object({
    users: z.array(z.object({ accountId: z.string(), displayName: z.string(), email: z.string().nullable() })),
    me: z.string(),
  }),
});

export const assignRpc = defineRpc({
  name: "jira.assign",
  input: z.object({ key: z.string(), accountId: z.string().nullable() }),
  output: z.object({ ok: z.literal(true) }),
});

export const updatePluginRpc = defineRpc({
  name: "jira.update-plugin",
  input: z.object({}),
  output: z.object({
    status: z.enum(["updated", "current", "local", "completed"]),
    message: z.string(),
  }),
});

export const testConnectionRpc = defineRpc({
  name: "jira.test-connection",
  input: z.object({}),
  output: z.object({ displayName: z.string() }),
});

export const remoteBranchesRpc = defineRpc({
  name: "git.remote-branches",
  input: z.object({ cwd: z.string() }),
  output: z.object({ defaultBranch: z.string().nullable(), branches: z.array(z.string()) }),
});

export const jiraAttachments = defineAttachmentSource({
  id: "jira",
  title: "Jira ticket",
  icon: "Ticket",
  pickerTitle: "Attach Jira ticket",
  searchPlaceholder: "Ticket key or text",
  search: searchTicketsRpc,
});

/** Start modal prompt: the ticket itself (link, title) travels as the attached card. */
export function startPrompt(key: string): string {
  return `Implement the attached Jira ticket ${key}. Use branch name ${key}.`;
}

export function defaultPrompt(key: string, url: string): string {
  return `Implement Jira ticket ${url}. Use branch name ${key}.`;
}

/** Active sprints; if none, each board's next upcoming sprint (boards list future sprints in start order). */
export function defaultSprints<T extends { state: string; boardName?: string }>(sprints: T[]): T[] {
  const active = sprints.filter((sp) => sp.state === "active");
  if (active.length > 0) return active;
  const next = new Map<string | undefined, T>();
  for (const sp of sprints) if (sp.state === "future" && !next.has(sp.boardName)) next.set(sp.boardName, sp);
  return [...next.values()];
}
