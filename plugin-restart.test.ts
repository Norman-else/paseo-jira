import assert from "node:assert/strict";
import { test } from "node:test";
import { pluginRestartResult } from "./shared/plugin-update.ts";

test("an interrupted self-update RPC becomes a restart completion", () => {
  const error = new Error("Request failed: Plugin stopped: paseo-jira requestType=plugin.rpc.invoke.request code=handler_error");
  const result = pluginRestartResult(error);

  assert.equal(result?.status, "completed");
  assert.match(result?.message ?? "", /restarted/i);
});

test("other plugin interruptions and errors are not hidden", () => {
  assert.equal(pluginRestartResult(new Error("Plugin stopped: another-plugin")), null);
  assert.equal(pluginRestartResult(new Error("Network request failed")), null);
  assert.equal(pluginRestartResult("Plugin stopped: paseo-jira"), null);
});
