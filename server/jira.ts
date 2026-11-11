import { z } from "zod";
import { defaultPrompt, defaultSprints, jiraSettings } from "../shared/jira";
import { buildSearchJql, buildListJql } from "./jql";
import { descriptionToMarkdown } from "./description-markdown";
import { completionStore, createSprintCompletion, type CompletionStore } from "./sprint-completion";

type JiraSettings = z.output<typeof jiraSettings.schema>;

const SearchResponseSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      fields: z.object({
        summary: z.string(),
        status: z.object({ name: z.string() }).nullish(),
        assignee: z.object({ displayName: z.string() }).nullish(),
      }),
    }),
  ),
});

const JiraSprintSchema = z.object({
  id: z.number(), name: z.string(), state: z.string(), boardId: z.number().optional(),
  startDate: z.string().nullish(), endDate: z.string().nullish(),
});

const IssuePickerSchema = z.object({
  sections: z.array(z.object({ issues: z.array(z.object({ key: z.string() })) })),
});

const ListResponseSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      fields: z.looseObject({
        summary: z.string(),
        status: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }).nullish(),
        assignee: z.object({ displayName: z.string() }).nullish(),
      }),
    }),
  ),
});

const TicketDetailsResponseSchema = z.object({
  key: z.string(),
  fields: z.looseObject({
    summary: z.string(),
    description: z.unknown().nullish(),
    status: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }).nullish(),
    assignee: z.object({ displayName: z.string() }).nullish(),
    reporter: z.object({ displayName: z.string() }).nullish(),
    priority: z.object({ name: z.string() }).nullish(),
    issuetype: z.object({ name: z.string() }).nullish(),
    created: z.string().nullish(),
    updated: z.string().nullish(),
    labels: z.array(z.string()).nullish(),
    components: z.array(z.object({ name: z.string() })).nullish(),
  }),
});

const FieldSchema = z.object({
  id: z.string(), name: z.string().optional(),
  schema: z.object({ type: z.string().optional(), custom: z.string().optional() }).optional(),
});
const FieldsSchema = z.array(FieldSchema);
const EditMetadataSchema = z.object({ fields: z.record(z.string(), z.object({
  name: z.string(), schema: z.object({ type: z.string().optional(), custom: z.string().optional() }).optional(),
  operations: z.array(z.string()).optional(),
})) });
const BoardConfigurationSchema = z.object({ estimation: z.object({
  type: z.string(), field: z.object({ fieldId: z.string(), displayName: z.string() }).optional(),
}).optional() });
function isStoryPoints(field: { name?: string; schema?: { type?: string; custom?: string } }) {
  return field.schema?.type === "number" && (
    field.schema.custom === "com.pyxis.greenhopper.jira:jsw-story-points" ||
    /^(story points|story point estimate)$/i.test(field.name ?? "")
  );
}
const BoardSchema = z.object({ id: z.number(), name: z.string() });
const BoardPageSchema = z.object({
  values: z.array(BoardSchema.extend({ location: z.object({ projectKey: z.string().optional() }).optional() })),
  isLast: z.boolean().optional(),
});
const SprintPageSchema = z.object({ values: z.array(JiraSprintSchema), isLast: z.boolean().optional() });

const SPRINT_STATE_ORDER: Record<string, number> = { active: 0, future: 1, closed: 2 };

const TransitionsSchema = z.object({
  transitions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      to: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }),
    }),
  ),
});

const MyselfSchema = z.object({ displayName: z.string(), accountId: z.string() });
const UsersSchema = z.array(
  z.object({ accountId: z.string(), displayName: z.string(), emailAddress: z.string().optional(), active: z.boolean().optional() }),
);

function describeFailure(status: number): string {
  if (status === 401) return "Jira rejected the email or API token";
  if (status === 403) return "You do not have permission to perform this Jira action";
  if (status === 429) return "Jira rate limit reached. Try again shortly";
  return `Jira request failed with HTTP ${status}`;
}

export function createJiraClient(settings: JiraSettings, recoveryStore?: CompletionStore) {
  const { email, apiToken } = settings;
  const baseUrl = settings.baseUrl.replace(/\/+$/, "");
  if (!baseUrl || !email || !apiToken) {
    throw new Error("Configure Jira URL, email and API token in Settings → Plugins → Jira");
  }
  const auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
    });
    if (!response.ok) {
      // Surface Jira's own message (e.g. a required field on the transition screen) when there is one.
      const body = (await response.json().catch(() => null)) as { errorMessages?: string[]; errors?: Record<string, string> } | null;
      const detail = [...(body?.errorMessages ?? []), ...Object.values(body?.errors ?? {})].join("; ");
      throw new Error(detail || describeFailure(response.status));
    }
    return response.status === 204 ? null : response.json();
  }
  const completion = createSprintCompletion(request, recoveryStore ?? completionStore(baseUrl, email));

  // Discover site-specific custom field IDs; never hardcode a site's Story Points field.
  let fields: Promise<z.infer<typeof FieldsSchema>> | undefined;
  const getFields = () => (fields ??= request("/rest/api/3/field").then((value) => FieldsSchema.parse(value)));

  async function editableStoryPoints(key: string) {
    const [metadata, customFields, boards] = await Promise.all([
      request(`/rest/api/3/issue/${encodeURIComponent(key)}/editmeta`).then((value) => EditMetadataSchema.parse(value)),
      getFields(),
      Promise.all(settings.boardIds.map(async (boardId) => ({ boardId,
        config: BoardConfigurationSchema.parse(await request(`/rest/agile/1.0/board/${boardId}/configuration`)),
      }))),
    ]);
    const fields: { id: string; name: string; boardId?: number }[] = Object.entries(metadata.fields)
      .filter(([, field]) => isStoryPoints(field) && field.operations?.includes("set"))
      .map(([id, field]) => ({ id, name: field.name }));
    // Jira's board estimation API can edit points even when the field is absent from the issue screen.
    for (const { boardId, config } of boards) {
      const field = config.estimation?.type === "field" ? config.estimation.field : undefined;
      if (!field || !customFields.some((f) => f.id === field.fieldId && isStoryPoints(f))) continue;
      const existing = fields.find((f) => f.id === field.fieldId);
      if (existing) existing.boardId ??= boardId;
      else fields.push({ id: field.fieldId, name: field.displayName, boardId });
    }
    return fields;
  }

  function pickSprint(value: unknown, sprintId: number | null) {
    const sprints = z.array(JiraSprintSchema).safeParse(value);
    if (!sprints.success || sprints.data.length === 0) return null;
    const chosen =
      sprints.data.find((sp) => (sprintId === null ? sp.state === "active" : sp.id === sprintId)) ??
      sprints.data[sprints.data.length - 1];
    return { id: chosen.id, name: chosen.name, state: chosen.state };
  }

  return {
    async list(input: { query: string; sprintId: number | null; mine: boolean; showDone: boolean }) {
      const customFields = await getFields();
      const field = customFields.find((f) => f.schema?.custom === "com.pyxis.greenhopper.jira:gh-sprint")?.id;
      const pointFields = customFields.filter(isStoryPoints);
      let sprintIds: number[] | null = input.sprintId === null ? null : [input.sprintId];
      if (sprintIds === null && settings.boardIds.length > 0) {
        sprintIds = defaultSprints((await this.sprints()).sprints).map((sp) => sp.id);
        if (sprintIds.length === 0) return { items: [] };
      }
      const body = {
        jql: buildListJql({ query: input.query, sprintIds, mine: input.mine, showDone: input.showDone }),
        maxResults: 100,
        fields: ["summary", "status", "assignee", ...(field ? [field] : []), ...pointFields.map((f) => f.id)],
      };
      const { issues } = ListResponseSchema.parse(
        await request("/rest/api/3/search/jql", { method: "POST", body: JSON.stringify(body) }),
      );
      return {
        items: issues.map((issue) => ({
          id: issue.id,
          key: issue.key,
          title: issue.fields.summary,
          url: `${baseUrl}/browse/${issue.key}`,
          status: issue.fields.status?.name ?? "",
          statusCategory: issue.fields.status?.statusCategory.key ?? "",
          assignee: issue.fields.assignee?.displayName ?? null,
          // If multiple point fields contain values, leave the summary unset; the editor lets the user choose.
          storyPoints: (() => {
            const values = pointFields.map((f) => issue.fields[f.id]).filter((v) => typeof v === "number");
            return values.length === 1 ? values[0] as number : null;
          })(),
          sprint: field ? pickSprint(issue.fields[field], input.sprintId) : null,
        })),
      };
    },
    /** Active + future sprints of the boards chosen in settings. */
    async sprints() {
      const perBoard = await Promise.all(
        settings.boardIds.map(async (boardId) => {
          const board = BoardSchema.parse(await request(`/rest/agile/1.0/board/${boardId}`));
          const open: z.infer<typeof JiraSprintSchema>[] = [];
          for (let startAt = 0; ; startAt += 50) {
            const page = SprintPageSchema.parse(await request(`/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=50&startAt=${startAt}`));
            open.push(...page.values);
            if (page.isLast !== false || page.values.length === 0) break;
          }
          return open.map((sp) => ({ id: sp.id, name: sp.name, state: sp.state, boardName: board.name, startDate: sp.startDate ?? null, endDate: sp.endDate ?? null }));
        }),
      );
      const seen = new Set<number>();
      const sprints = perBoard
        .flat()
        .filter((sp) => !seen.has(sp.id) && seen.add(sp.id))
        .sort((a, b) => (SPRINT_STATE_ORDER[a.state] ?? 3) - (SPRINT_STATE_ORDER[b.state] ?? 3));
      return { sprints };
    },
    async storyPoints(key: string) {
      const fields = await editableStoryPoints(key);
      if (!fields.length) return { fields: [] };
      const params = new URLSearchParams({ fields: fields.map((f) => f.id).join(",") });
      const issue = z.object({ fields: z.record(z.string(), z.unknown()) }).parse(
        await request(`/rest/api/3/issue/${encodeURIComponent(key)}?${params}`),
      );
      return { fields: fields.map((field) => ({ ...field, value: z.number().nullable().parse(issue.fields[field.id] ?? null) })) };
    },
    async setStoryPoints(key: string, fieldId: string, value: number | null) {
      z.number().nonnegative().nullable().parse(value);
      const fields = await editableStoryPoints(key);
      const field = fields.find((f) => f.id === fieldId);
      if (!field) throw new Error("Story Points is not editable for this ticket. Check its field configuration and your Jira permissions.");
      if (field.boardId !== undefined) {
        await request(`/rest/agile/1.0/issue/${encodeURIComponent(key)}/estimation?boardId=${field.boardId}`, {
          method: "PUT", body: JSON.stringify({ value: value === null ? "" : String(value) }),
        });
      } else {
        await request(`/rest/api/3/issue/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ fields: { [fieldId]: value } }) });
      }
      return { ok: true as const };
    },
    async startSprint(sprintId: number, startDate: string, endDate: string) {
      if (!Number.isFinite(Date.parse(startDate)) || !Number.isFinite(Date.parse(endDate)) || Date.parse(endDate) <= Date.parse(startDate)) {
        throw new Error("End date must be after a valid start date");
      }
      const sprint = JiraSprintSchema.parse(await request(`/rest/agile/1.0/sprint/${sprintId}`));
      if (sprint.state !== "future") throw new Error("Only a future sprint can be started. Refresh the sprint list.");
      await request(`/rest/agile/1.0/sprint/${sprintId}`, {
        method: "POST", body: JSON.stringify({ state: "active", startDate, endDate }),
      });
      return { ok: true as const };
    },
    previewCompleteSprint: completion.preview,
    completeSprint: completion.complete,
    async boards() {
      const boards: { id: number; name: string; project: string | null }[] = [];
      for (let startAt = 0; ; startAt += 50) {
        const page = BoardPageSchema.parse(await request(`/rest/agile/1.0/board?type=scrum&startAt=${startAt}&maxResults=50`));
        boards.push(...page.values.map((b) => ({ id: b.id, name: b.name, project: b.location?.projectKey ?? null })));
        if (page.isLast !== false || page.values.length === 0) break;
      }
      return { boards };
    },
    async details(key: string) {
      const fields = [
        "summary",
        "description",
        "status",
        "assignee",
        "reporter",
        "priority",
        "issuetype",
        "created",
        "updated",
        "labels",
        "components",
      ];
      const params = new URLSearchParams({ fields: fields.join(",") });
      const issue = TicketDetailsResponseSchema.parse(
        await request(`/rest/api/3/issue/${encodeURIComponent(key)}?${params}`),
      );
      return {
        key: issue.key,
        title: issue.fields.summary,
        url: `${baseUrl}/browse/${issue.key}`,
        description: descriptionToMarkdown(issue.fields.description),
        type: issue.fields.issuetype?.name ?? "",
        priority: issue.fields.priority?.name ?? "",
        status: issue.fields.status?.name ?? "",
        statusCategory: issue.fields.status?.statusCategory.key ?? "",
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        created: issue.fields.created ?? null,
        updated: issue.fields.updated ?? null,
        labels: issue.fields.labels ?? [],
        components: issue.fields.components?.map((component) => component.name) ?? [],
      };
    },
    async transitions(key: string) {
      const { transitions } = TransitionsSchema.parse(
        await request(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`),
      );
      return {
        transitions: transitions.map((t) => ({ id: t.id, name: t.name, to: t.to.name, toCategory: t.to.statusCategory.key })),
      };
    },
    async transition(key: string, transitionId: string) {
      await request(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
        method: "POST",
        body: JSON.stringify({ transition: { id: transitionId } }),
      });
      return { ok: true as const };
    },
    async assignees(key: string, query: string) {
      const params = new URLSearchParams({ issueKey: key, query, maxResults: "50" });
      const [users, me] = await Promise.all([
        request(`/rest/api/3/user/assignable/search?${params}`).then((u) => UsersSchema.parse(u)),
        request("/rest/api/3/myself").then((m) => MyselfSchema.parse(m)),
      ]);
      return {
        users: users
          .filter((u) => u.active !== false)
          .map((u) => ({ accountId: u.accountId, displayName: u.displayName, email: u.emailAddress ?? null })),
        me: me.accountId,
      };
    },
    async assign(key: string, accountId: string | null) {
      await request(`/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, {
        method: "PUT",
        body: JSON.stringify({ accountId }),
      });
      return { ok: true as const };
    },
    async myself() {
      return MyselfSchema.parse(await request("/rest/api/3/myself"));
    },
    async search(query: string) {
      const body = {
        jql: await buildSearchJql(query, settings.defaultJql, async (number) => {
          // Search all visible issues, not just the user's recently viewed tickets.
          const params = new URLSearchParams({ query: number, currentJQL: "ORDER BY updated DESC" });
          const picker = IssuePickerSchema.parse(await request(`/rest/api/3/issue/picker?${params}`));
          return picker.sections.flatMap((section) => section.issues.map((issue) => issue.key));
        }),
        maxResults: 50,
        fields: ["summary", "status", "assignee"],
      };
      const { issues } = SearchResponseSchema.parse(
        await request("/rest/api/3/search/jql", { method: "POST", body: JSON.stringify(body) }),
      );
      return {
        items: issues.map((issue) => {
          const url = `${baseUrl}/browse/${issue.key}`;
          const subtitle = [issue.fields.status?.name, issue.fields.assignee?.displayName]
            .filter(Boolean)
            .join(" · ");
          return {
            id: issue.id,
            identifier: issue.key,
            title: issue.fields.summary,
            ...(subtitle ? { subtitle } : {}),
            url,
            text: defaultPrompt(issue.key, url),
            resourceType: "issue",
          };
        }),
      };
    },
  };
}
