import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginUpdateProposal } from "@getpaseo/protocol/messages";
import { applyJiraPluginUpdate, checkJiraPluginUpdate } from "./server/plugin-update.ts";

const id = "paseo-jira";
const current = "1".repeat(40);
const target = "2".repeat(40);
const remote = "https://github.com/Norman-else/paseo-jira.git";
const proposal: PluginUpdateProposal = {
  id,
  expected: {
    identity: { kind: "git", remote, pluginPath: "." },
    installationRoot: "/installed/paseo-jira",
    revision: current,
  },
  target: { kind: "git", commit: target },
};
const update = (candidate = proposal) => ({ id, outcome: "update" as const, proposal: candidate });
const installed = { id, outcome: "updated" as const };
const unused = async () => assert.fail("Unexpected update call");

test("host check reports current, newer, and local installations without applying", async () => {
  for (const outcome of ["current", "installed-newer", "local"] as const) {
    const result = await checkJiraPluginUpdate({
      previewPluginUpdates: async () => [{ id, outcome }],
      applyPluginUpdates: unused,
    }, unused);
    assert.equal(result.status, outcome === "local" ? "local" : "current");
  }
});

test("host check shows the source and revision, and only confirmation applies the proposal", async () => {
  const applied: unknown[] = [];
  const host = {
    plugins: {
      previewPluginUpdates: async (input: unknown) => {
        assert.deepEqual(input, { pluginId: id });
        const privateRemote = "https://name:secret@github.com/Norman-else/paseo-jira.git?token=private";
        return [update({ ...proposal, expected: { ...proposal.expected, identity: { kind: "git", remote: privateRemote, pluginPath: "." } } })];
      },
      applyPluginUpdates: async (proposals: unknown[]) => {
        applied.push(...proposals);
        return [installed];
      },
    },
  };

  const preview = await checkJiraPluginUpdate(host, unused);
  assert.equal(preview.status, "available");
  assert.equal(preview.source, remote);
  assert.equal(preview.currentRevision, current);
  assert.equal(preview.targetRevision, target);
  assert.equal(preview.latestFromSource, false);
  assert.deepEqual(applied, []);

  await assert.rejects(applyJiraPluginUpdate(host, "", unused), /check for updates again/i);
  assert.deepEqual(applied, []);
  const result = await applyJiraPluginUpdate(host, preview.confirmation, unused);
  assert.equal(result.status, "updated");
  assert.deepEqual(applied, [ (await host.plugins.previewPluginUpdates({ pluginId: id }))[0].proposal ]);
});

test("preview and apply failures preserve host errors", async () => {
  await assert.rejects(checkJiraPluginUpdate({
    previewPluginUpdates: async () => [{ id, outcome: "error", error: "Preview failed" }],
    applyPluginUpdates: unused,
  }, unused), /Preview failed/);

  const host = {
    previewPluginUpdates: async () => [update()],
    applyPluginUpdates: async () => [{ id, outcome: "error", error: "Apply failed" }],
  };
  const preview = await checkJiraPluginUpdate(host, unused);
  assert.equal(preview.status, "available");
  await assert.rejects(applyJiraPluginUpdate(host, preview.confirmation, unused), /Apply failed/);
});

test("update without a proposal cannot proceed", async () => {
  await assert.rejects(checkJiraPluginUpdate({
    previewPluginUpdates: async () => [{ id, outcome: "update" }],
    applyPluginUpdates: unused,
  }, unused), /proposal/i);
});

test("CLI check is read-only and a second action installs only the confirmed Git commit", async () => {
  const calls: string[][] = [];
  const cli = async (args: string[]) => {
    calls.push(args);
    return args.includes("--check") ? [update()] : [installed];
  };
  // An older write-only host API must not bypass the CLI preview.
  const host = { updatePluginSources: unused };
  const preview = await checkJiraPluginUpdate(host, cli);
  assert.equal(preview.status, "available");
  assert.equal(preview.source, remote);
  assert.equal(preview.latestFromSource, false);
  assert.deepEqual(calls, [["--check"]]);

  const result = await applyJiraPluginUpdate(host, preview.confirmation, cli);
  assert.equal(result.status, "updated");
  assert.deepEqual(calls, [["--check"], ["--check"], ["--ref", target]]);
});

test("CLI never installs if the source, revision, or target changed since confirmation", async () => {
  const calls: string[][] = [];
  let candidate = proposal;
  const cli = async (args: string[]) => {
    calls.push(args);
    return [update(candidate)];
  };
  const preview = await checkJiraPluginUpdate({}, cli);
  assert.equal(preview.status, "available");

  const changes: PluginUpdateProposal[] = [
    { ...proposal, expected: { ...proposal.expected, identity: { kind: "git", remote: "https://github.com/another/jira.git", pluginPath: "." } } },
    { ...proposal, expected: { ...proposal.expected, revision: "3".repeat(40) } },
    { ...proposal, target: { kind: "git", commit: "4".repeat(40) } },
  ];
  for (const changed of changes) {
    candidate = changed;
    await assert.rejects(applyJiraPluginUpdate({}, preview.confirmation, cli), /check for updates again/i);
  }
  assert.deepEqual(calls, Array.from({ length: 4 }, () => ["--check"]));
});

test("registry CLI fallback discloses the registry and asks for the latest reviewed release", async () => {
  const registry = { id: "norman-else/jira", url: "https://plugins.paseo.sh" };
  const registryUpdate = update({
    ...proposal,
    expected: { ...proposal.expected, identity: { kind: "git", remote, pluginPath: ".", registry } },
  });
  const calls: string[][] = [];
  const cli = async (args: string[]) => {
    calls.push(args);
    return args.includes("--check") ? [registryUpdate] : [installed];
  };

  const preview = await checkJiraPluginUpdate({}, cli);
  assert.equal(preview.status, "available");
  assert.match(preview.source, /norman-else\/jira via https:\/\/plugins\.paseo\.sh/);
  assert.equal(preview.latestFromSource, true);
  assert.deepEqual(calls, [["--check"]]);
  const result = await applyJiraPluginUpdate({}, preview.confirmation, cli);
  assert.equal(result.status, "updated");
  assert.deepEqual(calls, [["--check"], ["--check"], ["--yes"]]);
});
