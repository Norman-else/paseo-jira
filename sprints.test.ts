import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSprints } from "./shared/jira.ts";

test("defaultSprints prefers active, else next upcoming per board", () => {
  const sp = (id: number, state: string, boardName: string) => ({ id, state, boardName });
  assert.deepEqual(defaultSprints([sp(1, "active", "A"), sp(2, "future", "A")]).map((s) => s.id), [1]);
  assert.deepEqual(defaultSprints([sp(2, "future", "A"), sp(3, "future", "A"), sp(4, "future", "B")]).map((s) => s.id), [2, 4]);
  assert.deepEqual(defaultSprints([]), []);
});
