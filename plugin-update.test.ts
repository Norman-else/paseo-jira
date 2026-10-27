import assert from "node:assert/strict";
import { test } from "node:test";
import { runPaseoCli, updateJiraPlugin } from "./server/plugin-update.ts";

const unusedCli = async () => {
  throw new Error("CLI fallback should not be called");
};

test("preview current and installed-newer do not apply an update", async () => {
  for (const outcome of ["current", "installed-newer"]) {
    const result = await updateJiraPlugin({
      previewPluginUpdates: async () => [{ id: "paseo-jira", outcome }],
      applyPluginUpdates: unusedCli,
    }, unusedCli);
    assert.equal(result.status, "current");
  }
});

test("preview local leaves directory installations under source control", async () => {
  const result = await updateJiraPlugin({
    previewPluginUpdates: async () => [{ id: "paseo-jira", outcome: "local" }],
    applyPluginUpdates: unusedCli,
  }, unusedCli);

  assert.equal(result.status, "local");
  assert.match(result.message, /source directory/i);
});

test("preview update passes the proposal to apply", async () => {
  const proposal = { id: "proposal-1", target: { kind: "git", commit: "abc123" } };
  let applied: unknown[] = [];
  const result = await updateJiraPlugin({
    plugins: {
      previewPluginUpdates: async (input: unknown) => {
        assert.deepEqual(input, { pluginId: "paseo-jira" });
        return [{ id: "paseo-jira", outcome: "update", proposal }];
      },
      applyPluginUpdates: async (proposals: unknown[]) => {
        applied = proposals;
        return [{ id: "paseo-jira", outcome: "updated" }];
      },
    },
  }, unusedCli);

  assert.equal(result.status, "updated");
  assert.deepEqual(applied, [proposal]);
});

test("preview and apply failures preserve host errors", async () => {
  await assert.rejects(updateJiraPlugin({
    previewPluginUpdates: async () => [{ id: "paseo-jira", outcome: "error", error: "Preview failed" }],
    applyPluginUpdates: unusedCli,
  }, unusedCli), /Preview failed/);

  await assert.rejects(updateJiraPlugin({
    previewPluginUpdates: async () => [{ id: "paseo-jira", outcome: "update", proposal: { id: "proposal-1" } }],
    applyPluginUpdates: async () => [{ id: "paseo-jira", outcome: "error", error: "Apply failed" }],
  }, unusedCli), /Apply failed/);
});

test("preview update without a proposal is rejected", async () => {
  await assert.rejects(updateJiraPlugin({
    previewPluginUpdates: async () => [{ id: "paseo-jira", outcome: "update" }],
    applyPluginUpdates: unusedCli,
  }, unusedCli), /proposal/i);
});

test("legacy source updates map their updated flag", async () => {
  for (const updated of [true, false]) {
    const result = await updateJiraPlugin({
      updatePluginSources: async (pluginId: string) => {
        assert.equal(pluginId, "paseo-jira");
        return [{ id: "paseo-jira", updated }];
      },
    }, unusedCli);
    assert.equal(result.status, updated ? "updated" : "current");
  }
});

test("partial modern host APIs never fall back to the CLI", async () => {
  const hosts = [
    { previewPluginUpdates: async () => [] },
    { applyPluginUpdates: async () => [] },
  ];

  for (const host of hosts) {
    await assert.rejects(updateJiraPlugin(host, unusedCli), /incomplete plugin update API/i);
  }
});

test("missing host APIs fall back to the Paseo CLI", async () => {
  let calls = 0;
  const result = await updateJiraPlugin({}, async () => {
    calls += 1;
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "completed");
});

test("CLI failure includes the manual update command", async () => {
  await assert.rejects(updateJiraPlugin({}, async () => {
    throw new Error("paseo is not installed");
  }), /paseo plugin update paseo-jira/);
});

test("CLI confirms reviewed updates after the user clicks Check updates", async () => {
  let command = "";
  let args: string[] = [];
  await runPaseoCli(async (actualCommand, actualArgs) => {
    command = actualCommand;
    args = actualArgs;
  });

  assert.equal(command, "paseo");
  assert.deepEqual(args, ["plugin", "update", "paseo-jira", "--yes"]);
});
