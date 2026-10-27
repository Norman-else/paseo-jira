import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJql, buildListJql } from "./server/jql.ts";

test("buildJql", () => {
  assert.equal(buildJql("  ", "DEFAULT"), "DEFAULT");
  assert.equal(buildJql("abc-123", "DEFAULT"), 'key = "ABC-123"');
  assert.equal(buildJql('say "hi" \\', "D"), 'text ~ "say \\"hi\\" \\\\" ORDER BY updated DESC');
});

test("buildListJql", () => {
  const order = " ORDER BY status ASC, updated DESC";
  assert.equal(buildListJql({ query: "", sprintIds: null, mine: true }), "sprint in openSprints() AND assignee = currentUser()" + order);
  assert.equal(buildListJql({ query: "pay", sprintIds: [42, 7], mine: false }), 'sprint in (42, 7) AND text ~ "pay"' + order);
  assert.equal(buildListJql({ query: "psos-1", sprintIds: [42], mine: true }), 'key = "PSOS-1"');
});
