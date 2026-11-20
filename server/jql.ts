const TICKET_KEY = /^[A-Z][A-Z0-9]*-\d+$/i;

export function buildJql(query: string, defaultJql: string): string {
  const q = query.trim();
  if (!q) return defaultJql;
  if (TICKET_KEY.test(q)) return `key = "${q.toUpperCase()}"`;
  return `text ~ "${q.replace(/["\\]/g, "\\$&")}" ORDER BY updated DESC`;
}

type SuggestKeys = (query: string) => Promise<string[]>;

/** `key in (...)` for a bare ticket number such as "6404" (any project), or null when nothing matches exactly. */
async function ticketNumberJql(query: string, suggestKeys: SuggestKeys): Promise<string | null> {
  const q = query.trim();
  if (!/^\d+$/.test(q)) return null;
  const keys = [...new Set((await suggestKeys(q))
    .filter((key) => TICKET_KEY.test(key) && key.slice(key.lastIndexOf("-") + 1) === q)
    .map((key) => key.toUpperCase()))];
  return keys.length ? `key in (${keys.map((key) => `"${key}"`).join(", ")}) ORDER BY updated DESC` : null;
}

export async function buildSearchJql(query: string, defaultJql: string, suggestKeys: SuggestKeys): Promise<string> {
  return await ticketNumberJql(query, suggestKeys) ?? buildJql(query, defaultJql);
}

/** Jira screen search: a bare ticket number finds that ticket like a full key does, ignoring sprint filters. */
export async function buildListSearchJql(input: Parameters<typeof buildListJql>[0], suggestKeys: SuggestKeys): Promise<string> {
  return await ticketNumberJql(input.query, suggestKeys) ?? buildListJql(input);
}

/** JQL for the Jira screen: given sprints (null = all open sprints), optionally only mine, optional text/key search. */
export function buildListJql(input: { query: string; sprintIds: number[] | null; mine: boolean; showDone?: boolean }): string {
  const q = input.query.trim();
  if (TICKET_KEY.test(q)) return `key = "${q.toUpperCase()}"`;
  const clauses = [input.sprintIds === null ? "sprint in openSprints()" : `sprint in (${input.sprintIds.join(", ")})`];
  if (input.mine) clauses.push("assignee = currentUser()");
  if (!input.showDone) clauses.push("statusCategory != Done");
  if (q) clauses.push(`text ~ "${q.replace(/["\\]/g, "\\$&")}"`);
  return `${clauses.join(" AND ")} ORDER BY status ASC, updated DESC`;
}
