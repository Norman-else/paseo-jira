import { z } from "zod";
import { defaultPrompt, defaultSprints, jiraSettings } from "../shared/jira";
import { buildJql, buildListJql } from "./jql";
import { descriptionToMarkdown } from "./description-markdown";

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

const JiraSprintSchema = z.object({ id: z.number(), name: z.string(), state: z.string(), boardId: z.number().optional() });

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

const FieldsSchema = z.array(z.object({ id: z.string(), schema: z.object({ custom: z.string().optional() }).optional() }));
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
  if (status === 401 || status === 403) return "Jira rejected the email or API token";
  if (status === 429) return "Jira rate limit reached. Try again shortly";
  return `Jira request failed with HTTP ${status}`;
}

export function createJiraClient(settings: JiraSettings) {
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

  // The sprint field is a custom field whose id differs per site; discover it once.
  let sprintField: Promise<string | null> | undefined;
  const findSprintField = () =>
    (sprintField ??= request("/rest/api/3/field").then((fields) => {
      const found = FieldsSchema.parse(fields).find((f) => f.schema?.custom === "com.pyxis.greenhopper.jira:gh-sprint");
      return found?.id ?? null;
    }));

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
      const field = await findSprintField();
      let sprintIds: number[] | null = input.sprintId === null ? null : [input.sprintId];
      if (sprintIds === null && settings.boardIds.length > 0) {
        sprintIds = defaultSprints((await this.sprints()).sprints).map((sp) => sp.id);
        if (sprintIds.length === 0) return { items: [] };
      }
      const body = {
        jql: buildListJql({ query: input.query, sprintIds, mine: input.mine, showDone: input.showDone }),
        maxResults: 100,
        fields: ["summary", "status", "assignee", ...(field ? [field] : [])],
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
          sprint: field ? pickSprint(issue.fields[field], input.sprintId) : null,
        })),
      };
    },
    /** Active + future sprints of the boards chosen in settings. */
    async sprints() {
      const perBoard = await Promise.all(
        settings.boardIds.map(async (boardId) => {
          const board = BoardSchema.parse(await request(`/rest/agile/1.0/board/${boardId}`));
          const open = SprintPageSchema.parse(
            await request(`/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=50`),
          ).values;
          return open.map((sp) => ({ id: sp.id, name: sp.name, state: sp.state, boardName: board.name }));
        }),
      );
      const seen = new Set<number>();
      const sprints = perBoard
        .flat()
        .filter((sp) => !seen.has(sp.id) && seen.add(sp.id))
        .sort((a, b) => (SPRINT_STATE_ORDER[a.state] ?? 3) - (SPRINT_STATE_ORDER[b.state] ?? 3));
      return { sprints };
    },
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
        jql: buildJql(query, settings.defaultJql),
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
