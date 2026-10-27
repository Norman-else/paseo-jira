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

export function defaultPrompt(key: string, url: string): string {
  return `Implement Jira ticket ${url}. Use branch name ${key}.`;
}
