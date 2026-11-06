const TICKET_KEY = /^[A-Z][A-Z0-9]*-\d+$/i;

export function buildJql(query: string, defaultJql: string): string {
  const q = query.trim();
  if (!q) return defaultJql;
  if (TICKET_KEY.test(q)) return `key = "${q.toUpperCase()}"`;
  return `text ~ "${q.replace(/["\\]/g, "\\$&")}" ORDER BY updated DESC`;
}

export async function buildSearchJql(query: string, defaultJql: string, suggestKeys: (query: string) => Promise<string[]>): Promise<string> {
  const q = query.trim();
  if (/^\d+$/.test(q)) {
    const keys = [...new Set((await suggestKeys(q))
      .filter((key) => TICKET_KEY.test(key) && key.slice(key.lastIndexOf("-") + 1) === q)
      .map((key) => key.toUpperCase()))];
    if (keys.length) return `key in (${keys.map((key) => `"${key}"`).join(", ")}) ORDER BY updated DESC`;
  }
  return buildJql(query, defaultJql);
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
