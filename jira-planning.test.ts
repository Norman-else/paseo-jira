import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test, type TestContext } from "node:test";
import { formatSprintDate, parseSprintDate, parseStoryPoints } from "./shared/planning.ts";

// The plugin bundler accepts extensionless imports; resolve the same imports in Node's TS test runner.
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw error;
  }
} });
const { createJiraClient } = await import("./server/jira.ts");
const settings = { baseUrl: "https://jira.example", email: "test@example.com", apiToken: "test", defaultJql: "", boardIds: [13] };
const point = { id: "customfield_42", name: "Story Points", schema: { type: "number", custom: "com.atlassian.jira.plugin.system.customfieldtypes:float" } };
const teamPoint = { id: "customfield_99", name: "Story point estimate", schema: { type: "number", custom: "com.pyxis.greenhopper.jira:jsw-story-points" } };
const sprintField = { id: "customfield_20", name: "Sprint", schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" } };

function fixture(t: TestContext, routes: Record<string, unknown>, status = 200) {
  const writes: { path: string; method: string; body: unknown }[] = [];
  const reads: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    const path = url.replace(settings.baseUrl, "");
    const method = init.method ?? "GET";
    if (method !== "GET" && path !== "/rest/api/3/search/jql") {
      writes.push({ path, method, body: JSON.parse(init.body as string) });
      return status === 204 ? new Response(null, { status }) : Response.json(status === 403 ? {} : { ok: true }, { status });
    }
    reads.push(path);
    assert.ok(Object.hasOwn(routes, path), `Unexpected request: ${method} ${path}`);
    return Response.json(routes[path]);
  });
  return { client: createJiraClient(settings), writes, reads };
}

const boardRoutes = {
  "/rest/api/3/field": [point, teamPoint, sprintField],
  "/rest/agile/1.0/board/13/configuration": { estimation: { type: "field", field: { fieldId: point.id, displayName: point.name } } },
  "/rest/api/3/issue/ABC-1/editmeta": { fields: {} },
};

test("board Story Points can be read and edited even when absent from the issue edit screen", async (t) => {
  const { client, writes } = fixture(t, { ...boardRoutes,
    "/rest/api/3/issue/ABC-1?fields=customfield_42": { fields: { [point.id]: 0 } },
  });
  const fields = (await client.storyPoints("ABC-1")).fields;
  assert.equal(fields.length, 1);
  assert.equal(fields[0].value, 0);
  await client.setStoryPoints("ABC-1", point.id, 2.5);
  await client.setStoryPoints("ABC-1", point.id, 0);
  await client.setStoryPoints("ABC-1", point.id, null);
  assert.deepEqual(writes, ["2.5", "0", ""].map((value) => ({
    path: "/rest/agile/1.0/issue/ABC-1/estimation?boardId=13", method: "PUT", body: { value },
  })));
});

test("editable fields without a matching board use issue edit and do not overwrite other fields", async (t) => {
  const { client, writes } = fixture(t, { ...boardRoutes,
    "/rest/api/3/issue/ABC-1/editmeta": { fields: { [teamPoint.id]: { ...teamPoint, operations: ["set"] } } },
  }, 204);
  await client.setStoryPoints("ABC-1", teamPoint.id, null);
  assert.deepEqual(writes, [{ path: "/rest/api/3/issue/ABC-1", method: "PUT", body: { fields: { [teamPoint.id]: null } } }]);
});

test("arbitrary fields and invalid estimates fail before any write", async (t) => {
  const { client, writes } = fixture(t, boardRoutes);
  await assert.rejects(client.setStoryPoints("ABC-1", "summary", 3), /not editable/);
  await assert.rejects(client.setStoryPoints("ABC-1", point.id, -1));
  await assert.rejects(client.setStoryPoints("ABC-1", point.id, Infinity));
  assert.equal(writes.length, 0);
});

test("Jira permissions errors are surfaced instead of reporting success", async (t) => {
  const { client } = fixture(t, boardRoutes, 403);
  await assert.rejects(client.setStoryPoints("ABC-1", point.id, 1), /permission/);
});

test("list discovers point fields, preserves zero and avoids summing ambiguous estimates", async (t) => {
  const { client } = fixture(t, { "/rest/api/3/field": [point, teamPoint, sprintField],
    "/rest/api/3/search/jql": { issues: [
      { id: "1", key: "ABC-1", fields: { summary: "Zero", [point.id]: 0, [teamPoint.id]: null } },
      { id: "2", key: "ABC-2", fields: { summary: "Unset" } },
      { id: "3", key: "ABC-3", fields: { summary: "Ambiguous", [point.id]: 3, [teamPoint.id]: 5 } },
    ] },
  });
  const result = await client.list({ query: "", sprintId: 10, mine: false, showDone: true });
  assert.deepEqual(result.items.map((i) => i.storyPoints), [0, null, null]);
});

test("starting and completing use partial updates and check live sprint state", async (t) => {
  const { client, writes } = fixture(t, {
    "/rest/agile/1.0/sprint/10": { id: 10, name: "Next", state: "future" },
    "/rest/agile/1.0/sprint/11": { id: 11, name: "Current", state: "active" },
    "/rest/agile/1.0/sprint/12": { id: 12, name: "Old", state: "closed" },
  });
  const startDate = "2026-11-11T01:00:00.000Z", endDate = "2026-11-25T01:00:00.000Z";
  await client.startSprint(10, startDate, endDate);
  await client.completeSprint(11);
  assert.deepEqual(writes, [
    { path: "/rest/agile/1.0/sprint/10", method: "POST", body: { state: "active", startDate, endDate } },
    { path: "/rest/agile/1.0/sprint/11", method: "POST", body: { state: "closed" } },
  ]);
  await assert.rejects(client.startSprint(11, startDate, endDate), /future sprint/);
  await assert.rejects(client.completeSprint(10), /active sprint/);
  await assert.rejects(client.completeSprint(12), /active sprint/);
  await assert.rejects(client.startSprint(10, endDate, startDate), /End date/);
  assert.equal(writes.length, 2);
});

test("sprints pagination retains start and end dates for the start dialog", async (t) => {
  const sprint = { id: 10, name: "Next", state: "future", startDate: "2026-11-11T01:00:00Z", endDate: "2026-11-25T01:00:00Z" };
  const { client, reads } = fixture(t, {
    "/rest/agile/1.0/board/13": { id: 13, name: "Board" },
    "/rest/agile/1.0/board/13/sprint?state=active,future&maxResults=50&startAt=0": { values: [sprint], isLast: false },
    "/rest/agile/1.0/board/13/sprint?state=active,future&maxResults=50&startAt=50": { values: [{ id: 11, name: "Current", state: "active" }], isLast: true },
  });
  const result = await client.sprints();
  assert.deepEqual(result.sprints.map((s) => s.id), [11, 10]);
  assert.equal(result.sprints[1].startDate, sprint.startDate);
  assert.equal(result.sprints[1].endDate, sprint.endDate);
  assert.equal(reads.length, 3);
});

test("point input distinguishes clear and zero, accepts decimals, and rejects malformed numbers", () => {
  assert.equal(parseStoryPoints(" "), null);
  assert.equal(parseStoryPoints("0"), 0);
  assert.equal(parseStoryPoints(" 2.5 "), 2.5);
  for (const text of ["-1", "NaN", "Infinity", "0x10", "1e3", "1,5", "3 points"]) assert.throws(() => parseStoryPoints(text));
});

test("sprint date input handles local time and rejects impossible calendar dates", () => {
  const local = new Date(2026, 10, 11, 9, 30);
  assert.equal(formatSprintDate(local), "2026-11-11 09:30");
  assert.equal(parseSprintDate("2026-11-11 09:30"), local.toISOString());
  assert.equal(parseSprintDate("2028-02-29 10:00"), new Date(2028, 1, 29, 10).toISOString());
  for (const date of ["2026-02-29 10:00", "2026-11-31 10:00", "2026-11-11 24:00", "11/11/2026", ""]) assert.throws(() => parseSprintDate(date));
});
