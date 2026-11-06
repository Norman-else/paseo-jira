import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJql, buildListJql, buildSearchJql } from "./server/jql.ts";

test("attachment search resolves a bare ticket number across projects and deduplicates picker results", async () => {
  const jql = await buildSearchJql(" 6094 ", "DEFAULT", async (query) => {
    assert.equal(query, "6094");
    return ["PSOS-6094", "PSOS-6094", "OPS-6094", "PSOS-16094", "PSOS-60940", 'bad"key-6094'];
  });
  assert.equal(jql, 'key in ("PSOS-6094", "OPS-6094") ORDER BY updated DESC');
});

test("attachment search preserves full keys, text and empty-query defaults without calling the picker", async () => {
  const noPicker = async () => { throw new Error("Picker should only be used for bare numbers"); };
  assert.equal(await buildSearchJql(" psos-6094 ", "DEFAULT", noPicker), 'key = "PSOS-6094"');
  assert.equal(await buildSearchJql("a-1", "DEFAULT", noPicker), 'key = "A-1"');
  assert.equal(await buildSearchJql("pay", "DEFAULT", noPicker), 'text ~ "pay" ORDER BY updated DESC');
  assert.equal(await buildSearchJql(" ", "DEFAULT", noPicker), "DEFAULT");
});

test("attachment search falls back to numeric text when the picker has no matching ticket keys", async () => {
  assert.equal(await buildSearchJql("6094", "DEFAULT", async () => ["PSOS-16094"]), 'text ~ "6094" ORDER BY updated DESC');
});

test("buildJql", () => {
  assert.equal(buildJql("  ", "DEFAULT"), "DEFAULT");
  assert.equal(buildJql("abc-123", "DEFAULT"), 'key = "ABC-123"');
  assert.equal(buildJql('say "hi" \\', "D"), 'text ~ "say \\"hi\\" \\\\" ORDER BY updated DESC');
});

test("buildListJql", () => {
  const order = " ORDER BY status ASC, updated DESC";
  assert.equal(buildListJql({ query: "", sprintIds: null, mine: true }), "sprint in openSprints() AND assignee = currentUser() AND statusCategory != Done" + order);
  assert.equal(buildListJql({ query: "pay", sprintIds: [42, 7], mine: false, showDone: true }), 'sprint in (42, 7) AND text ~ "pay"' + order);
  assert.equal(buildListJql({ query: "psos-1", sprintIds: [42], mine: true }), 'key = "PSOS-1"');
});
