import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompletionStore } from "./server/sprint-completion.ts";

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { createSprintCompletion, completionStore } = await import("./server/sprint-completion.ts");
const issue = (id: number, category = "indeterminate", parent?: number) => ({
  id: String(id), key: `ABC-${id}`, fields: {
    summary: `Work ${id}`, status: { id: category, name: category === "done" ? "Done" : "In Progress", statusCategory: { key: category } },
    issuetype: { subtask: parent !== undefined }, parent: parent === undefined ? null : { id: String(parent), key: `ABC-${parent}` },
    sprint: null as { id: number; state: string } | null,
  },
});
type Issue = ReturnType<typeof issue>;

function fixture(initial: Issue[] = [issue(1), issue(2, "done")]) {
  const source = { id: 10, name: "Current", state: "active", originBoardId: 13 };
  const target = { id: 20, name: "Next", state: "future", originBoardId: 13 };
  const records = new Map<number, Awaited<ReturnType<CompletionStore["read"]>>>();
  const store: CompletionStore = {
    key: Math.random().toString(),
    async read(id) { return structuredClone(records.get(id) ?? null); },
    async write(id, value) { records.set(id, structuredClone(value)); },
  };
  const calls: { path: string; body: any }[] = [];
  const reads: string[] = [];
  const state = { source, target, issues: initial, futures: [target], failMove: 0, moveAttempts: 0, failClose: false, failAfterMove: false, duplicateToken: false };
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const url = new URL(path, "https://jira.example");
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      calls.push({ path: url.pathname, body });
      if (url.pathname === "/rest/agile/1.0/sprint/10") {
        if (state.failClose) throw new Error("No permission to close sprint");
        source.state = "closed";
        return source;
      }
      state.moveAttempts++;
      if (state.failMove === state.moveAttempts) throw new Error("Move request failed");
      assert.ok(body.issues.length <= 50);
      for (const id of body.issues) {
        const item = state.issues.find((entry) => entry.id === id)!;
        item.fields.sprint = url.pathname.includes("backlog") ? null : { id: target.id, state: target.state };
      }
      if (state.failAfterMove) { state.failAfterMove = false; throw new Error("Lost response"); }
      return null;
    }
    reads.push(path);
    if (url.pathname === "/rest/agile/1.0/sprint/10") return source;
    if (url.pathname === "/rest/agile/1.0/sprint/20") return target;
    if (url.pathname === "/rest/agile/1.0/board/13") return { name: "Board" };
    if (url.pathname === "/rest/agile/1.0/board/13/sprint") return { values: state.futures, isLast: true };
    if (url.pathname === "/rest/software/1.0/sprint/10/issue") {
      assert.equal(url.searchParams.has("jql"), false, "The UI's Only mine/search filters must not restrict completion");
      const offset = Number(url.searchParams.get("nextPageToken") ?? 0);
      const page = state.issues.slice(offset, offset + 100);
      const next = state.issues.length > offset + 100 ? String(offset + 100) : undefined;
      return { issues: page, isLast: !next, nextPageToken: state.duplicateToken ? "100" : next };
    }
    throw new Error(`Unexpected path: ${path}`);
  };
  return { state, calls, reads, records, store, request, api: createSprintCompletion(request, store) };
}

test("preview shows every unfinished issue, statuses and the same-board next sprint without writes", async () => {
  const f = fixture([issue(3, "new"), issue(1), issue(2, "done")]);
  const plan = await f.api.preview(10);
  assert.deepEqual(plan.incomplete.map((i) => i.key), ["ABC-1", "ABC-3"]);
  assert.equal(plan.incomplete[0].status, "In Progress");
  assert.deepEqual(plan.destination, { id: 20, name: "Next" });
  assert.equal(plan.doneCount, 1);
  assert.equal(plan.totalCount, 3);
  assert.equal(f.calls.length, 0);
});

test("confirmation closes the sprint then moves only unfinished work, keeping Done work and history", async () => {
  const f = fixture();
  const plan = await f.api.preview(10);
  await f.api.complete(10, plan.confirmation);
  assert.deepEqual(f.calls, [
    { path: "/rest/agile/1.0/sprint/10", body: { state: "closed" } },
    { path: "/rest/agile/1.0/sprint/20/issue", body: { issues: ["1"] } },
  ]);
  assert.equal((await f.api.preview(10)).finished, true);
  await f.api.complete(10, plan.confirmation);
  assert.equal(f.calls.length, 2, "Duplicate submissions must not close or move again");
});

test("backlog is the fallback only when the same board has no next sprint", async () => {
  const f = fixture();
  f.state.futures = [];
  const plan = await f.api.preview(10);
  assert.equal(plan.destination, null);
  await f.api.complete(10, plan.confirmation);
  assert.deepEqual(f.calls[1], { path: "/rest/agile/1.0/backlog/issue", body: { issues: ["1"] } });
});

test("an all-Done sprint requires confirmation but moves no work", async () => {
  const f = fixture([issue(1, "done")]);
  await assert.rejects(f.api.complete(10, "not-confirmed"), /confirm/);
  const plan = await f.api.preview(10);
  await f.api.complete(10, plan.confirmation);
  assert.equal(plan.incomplete.length, 0);
  assert.equal(f.calls.length, 1);
});

test("issue/status or destination changes invalidate confirmation before any mutation", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.state.issues.push(issue(4)); },
    (f: ReturnType<typeof fixture>) => { f.state.issues[0].fields.status = issue(1, "done").fields.status; },
    (f: ReturnType<typeof fixture>) => { f.state.futures = []; },
    (f: ReturnType<typeof fixture>) => { f.state.target.name = "Renamed next sprint"; },
  ]) {
    const f = fixture();
    const plan = await f.api.preview(10);
    change(f);
    await assert.rejects(f.api.complete(10, plan.confirmation), /Refresh the preview/);
    assert.equal(f.calls.length, 0);
  }
});

test("reads all issue pages and moves more than fifty issues in supported batches", async () => {
  const f = fixture(Array.from({ length: 121 }, (_, index) => issue(index + 1)));
  const plan = await f.api.preview(10);
  assert.equal(plan.incomplete.length, 121);
  await f.api.complete(10, plan.confirmation);
  assert.deepEqual(f.calls.slice(1).map((call) => call.body.issues.length), [50, 50, 21]);
  assert.equal(f.calls.slice(1).flatMap((call) => call.body.issues).length, 121);
});

test("partial move failures can resume after creating a new client without closing twice", async () => {
  const f = fixture(Array.from({ length: 60 }, (_, index) => issue(index + 1)));
  const plan = await f.api.preview(10);
  f.state.failMove = 2;
  await assert.rejects(f.api.complete(10, plan.confirmation), /Sprint closed.*Retry/);
  assert.equal(f.records.get(10)?.moved.length, 50);
  const resumed = createSprintCompletion(f.request, f.store);
  assert.equal((await resumed.preview(10)).recovering, true);
  await resumed.complete(10, plan.confirmation);
  assert.deepEqual(f.calls.map((call) => call.body.issues?.length ?? "close"), ["close", 50, 10, 10]);
  assert.equal(f.records.get(10)?.phase, "finished");
});

test("lost move responses are reconciled from live sprint membership before retry", async () => {
  const f = fixture();
  const plan = await f.api.preview(10);
  f.state.failAfterMove = true;
  await assert.rejects(f.api.complete(10, plan.confirmation), /Lost response/);
  await f.api.complete(10, plan.confirmation);
  assert.equal(f.calls.length, 2, "Already moved work should not be moved again");
});

test("close failures do not move issues; a failed destination never silently falls back to backlog", async () => {
  const f = fixture();
  const plan = await f.api.preview(10);
  f.state.failClose = true;
  await assert.rejects(f.api.complete(10, plan.confirmation), /No permission/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.state.source.state, "active");
  f.state.failClose = false;
  f.state.target.state = "active";
  await assert.rejects(f.api.complete(10, plan.confirmation), /changed/);
  assert.equal(f.calls.length, 1);
});

test("unfinished subtasks are shown but move with their unfinished parent", async () => {
  const f = fixture([issue(1), issue(2, "new", 1), issue(3, "done")]);
  const plan = await f.api.preview(10);
  assert.equal(plan.incomplete[1].parentKey, "ABC-1");
  assert.equal(plan.blockedReason, null);
  await f.api.complete(10, plan.confirmation);
  assert.deepEqual(f.calls[1].body.issues, ["1"]);
  const orphan = fixture([issue(1, "done"), issue(2, "new", 1)]);
  const blocked = await orphan.api.preview(10);
  assert.match(blocked.blockedReason!, /ABC-2/);
  await assert.rejects(orphan.api.complete(10, blocked.confirmation), /subtask/);
  assert.equal(orphan.calls.length, 0);
});

test("retry does not overwrite work moved to another sprint or work that became Done", async () => {
  const f = fixture();
  const plan = await f.api.preview(10);
  f.state.failMove = 1;
  await assert.rejects(f.api.complete(10, plan.confirmation));
  f.state.issues[0].fields.sprint = { id: 30, state: "active" };
  await assert.rejects(f.api.complete(10, plan.confirmation), /another sprint/);
  assert.equal(f.calls.length, 2);
  f.state.issues[0].fields.status = issue(1, "done").fields.status;
  await f.api.complete(10, plan.confirmation);
  assert.equal(f.calls.length, 2);
});

test("closed sprints without a confirmed recovery receipt cannot be modified", async () => {
  const f = fixture();
  f.state.source.state = "closed";
  await assert.rejects(f.api.preview(10), /active sprint/);
  await assert.rejects(f.api.complete(10, "arbitrary"), /confirmation changed/);
  assert.equal(f.calls.length, 0);
});

test("repeated pagination tokens stop preview instead of using a partial list", async () => {
  const f = fixture(Array.from({ length: 201 }, (_, index) => issue(index + 1)));
  f.state.duplicateToken = true;
  await assert.rejects(f.api.preview(10), /repeated an issue page/);
  assert.equal(f.calls.length, 0);
});

test("existing assignments to other sprints are visible blockers before closing", async () => {
  const f = fixture();
  f.state.issues[0].fields.sprint = { id: 30, state: "future" };
  const plan = await f.api.preview(10);
  assert.match(plan.blockedReason!, /ABC-1.*another sprint/);
  await assert.rejects(f.api.complete(10, plan.confirmation), /another sprint/);
  assert.equal(f.calls.length, 0);
});

test("recovery receipts survive a filesystem store recreation without storing credentials", async () => {
  const home = await mkdtemp(join(tmpdir(), "paseo-completion-test-"));
  const previousHome = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  try {
    const f = fixture();
    const plan = await f.api.preview(10);
    const first = completionStore("https://jira.example", "test@example.com");
    await first.write(10, { plan, phase: "closed", moved: ["1"] });
    const second = completionStore("https://jira.example", "test@example.com");
    assert.deepEqual(await second.read(10), { plan, phase: "closed", moved: ["1"] });
    assert.equal(await second.read(99), null);
    const stored = await readFile(join(home, "plugin-data", "paseo-jira", "sprint-completions", first.key, "10.json"), "utf8");
    assert.equal(stored.includes("test@example.com"), false);
    assert.equal(stored.includes("apiToken"), false);
  } finally {
    if (previousHome === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});
