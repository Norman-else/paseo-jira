import assert from "node:assert/strict";
import { test } from "node:test";
import { DEVSPACE_DEFAULT_BRANCH, devspaceTargetError, devspaceWorkspaceOptions, devspaceWorktreePrompt, startProblem, type StartRequirements } from "./shared/devspace-worktree.ts";
import { devspaceWorktreeSettings } from "./shared/jira.ts";

test("DevSpace tasks create a Paseo directory session and delegate Git isolation to the configured MCP", () => {
  const attachments = [{ type: "text" as const, mimeType: "text/plain" as const, text: "Jira ticket", title: "PSOS-6291" }];
  const options = devspaceWorkspaceOptions({
    project: { id: "remote-project", root: "/home/ubuntu/workspaces/mercaso-connector" },
    ticket: { identifier: "PSOS-6291", title: "Bulk image upload" },
    provider: "claude/opus",
    prompt: "Implement the attached ticket without changing its acceptance criteria.",
    target: { projectPath: "/Users/normanzuo/Infras/mercaso-connector", baseRef: "origin/master" },
    attachments,
  });

  assert.deepEqual(options.source, {
    kind: "directory", path: "/home/ubuntu/workspaces/mercaso-connector", projectId: "remote-project",
  });
  assert.equal(options.title, "PSOS-6291 Bulk image upload");
  assert.equal(options.agent?.cwd, "/home/ubuntu/workspaces/mercaso-connector");
  assert.equal(options.agent?.config.provider, "claude/opus");
  assert.equal(options.agent?.attachments, attachments);
  const prompt = options.agent?.prompt ?? "";
  assert.ok(prompt.includes(JSON.stringify({
    path: "/Users/normanzuo/Infras/mercaso-connector", mode: "worktree", base_ref: "origin/master",
  })));
  assert.match(prompt, /fetch origin through the DevSpace MCP/);
  assert.match(prompt, /NEW workspace_id/);
  assert.match(prompt, /branch "PSOS-6291"/);
  assert.match(prompt, /never reset, overwrite, delete or force-switch/);
  assert.match(prompt, /show_changes/);
  assert.ok(prompt.endsWith("Implement the attached ticket without changing its acceptance criteria."));
});

test("invalid targets fail before an agent or workspace can be created", () => {
  for (const target of [
    { projectPath: "", baseRef: "HEAD" },
    { projectPath: "mercaso-connector", baseRef: "HEAD" },
    { projectPath: "/Users/name/project\nother", baseRef: "HEAD" },
    { projectPath: "/Users/name/project", baseRef: "" },
    { projectPath: "/Users/name/project", baseRef: "--help" },
    { projectPath: "/Users/name/project", baseRef: "HEAD\nother" },
  ]) {
    assert.ok(devspaceTargetError(target));
    assert.throws(() => devspaceWorktreePrompt({ ...target, branchName: "PSOS-6291", taskPrompt: "Implement" }));
  }
});

test("paths with spaces and home paths are passed as JSON, with a concrete base ref", () => {
  for (const projectPath of ["/Users/name/Work Projects/app", "~/work/app"]) {
    const prompt = devspaceWorktreePrompt({ projectPath, baseRef: " HEAD ", branchName: "PSOS-6291", taskPrompt: "Review only" });
    assert.ok(prompt.includes(JSON.stringify({ path: projectPath, mode: "worktree", base_ref: "HEAD" })));
    assert.match(prompt, /source checkout, its branch and all uncommitted changes untouched/);
    assert.match(prompt, /stop and report the exact error/);
  }
});

test("host settings keep each project's DevSpace target separate and default to an empty mapping", () => {
  assert.deepEqual(devspaceWorktreeSettings.schema.parse({}), { projects: {} });
  const values = devspaceWorktreeSettings.schema.parse({ projects: {
    connector: { projectPath: "/Users/name/Infras/connector" },
    store: { projectPath: "/Users/name/Mercaso/store", baseRef: "origin/main" },
  } });
  assert.equal(values.projects.connector.baseRef, "HEAD");
  assert.equal(values.projects.store.baseRef, "origin/main");
});

test("default branch choice resolves the real remote branch through DevSpace before creating the worktree", () => {
  const prompt = devspaceWorktreePrompt({ projectPath: "/Users/name/work/app", baseRef: DEVSPACE_DEFAULT_BRANCH,
    branchName: "PSOS-6071", taskPrompt: "Implement the attached ticket" });
  assert.equal(devspaceTargetError({ projectPath: "/Users/name/work/app", baseRef: DEVSPACE_DEFAULT_BRANCH }), null);
  assert.match(prompt, /fetch origin, then run git ls-remote --symref origin HEAD/);
  assert.match(prompt, /verify refs\/remotes\/origin\/<branch>\^\{commit\}/);
  assert.match(prompt, /Do not guess master or main and do not fall back to HEAD/);
  assert.ok(prompt.includes(JSON.stringify({ path: "/Users/name/work/app", mode: "worktree" })));
  assert.match(prompt, /base_ref set to the concrete origin\/<branch> resolved in step 2/);
  assert.equal(prompt.includes(DEVSPACE_DEFAULT_BRANCH), false, "The preference token must never be passed as a Git ref");
  assert.match(prompt, /source checkout, its branch and all uncommitted changes untouched/);
});

const ready: StartRequirements = { projectSelected: true, model: "claude/opus", prompt: "Implement the ticket", loading: false, worktree: { kind: "none" } };

test("Start explains missing basic fields and loading instead of silently doing nothing", () => {
  assert.equal(startProblem(ready), null);
  assert.match(startProblem({ ...ready, loading: true })!.message, /still loading/);
  assert.match(startProblem({ ...ready, projectSelected: false })!.message, /Choose a project/);
  assert.match(startProblem({ ...ready, model: "" })!.message, /Choose a model/);
  assert.match(startProblem({ ...ready, prompt: "  " })!.message, /task prompt/);
});

test("Start opens directory selection for a missing DevSpace path and only accepts a valid target", () => {
  const worktree = { kind: "devspace" as const, target: { projectPath: "", baseRef: DEVSPACE_DEFAULT_BRANCH }, settingsReady: true, saving: false };
  const missing = startProblem({ ...ready, worktree });
  assert.equal(missing?.chooseDirectory, true);
  assert.match(missing!.message, /actual DevSpace repository directory/);
  const valid = { ...worktree, target: { ...worktree.target, projectPath: "/Users/name/project" } };
  assert.equal(startProblem({ ...ready, worktree: valid }), null);
  assert.match(startProblem({ ...ready, worktree: { ...valid, settingsReady: false } })!.message, /settings are not ready/);
  assert.match(startProblem({ ...ready, worktree: { ...valid, saving: true } })!.message, /being saved/);
  assert.equal(startProblem({ ...ready, worktree: { ...valid, target: { ...valid.target, baseRef: "" } } })?.chooseDirectory, undefined);
  assert.match(startProblem({ ...ready, worktree: { ...valid, target: { ...valid.target, projectPath: "relative/path" } } })!.message, /absolute path/);
});

test("native worktree Start explains branch lookup failures and requires a selected branch", () => {
  const worktree = { kind: "native" as const, baseBranch: "origin/master", loading: false };
  assert.equal(startProblem({ ...ready, worktree }), null);
  assert.match(startProblem({ ...ready, worktree: { ...worktree, loading: true } })!.message, /branches are still loading/);
  assert.match(startProblem({ ...ready, worktree: { ...worktree, baseBranch: "" } })!.message, /Choose a base branch/);
  assert.equal(startProblem({ ...ready, worktree: { ...worktree, error: "Git access denied" } })?.message, "Git access denied");
});

test("a VPS session can launch against a Mac DevSpace directory without treating that path as VPS cwd", () => {
  const target = { projectPath: "/Users/normanzuo/Mercaso/premier-store-os", baseRef: DEVSPACE_DEFAULT_BRANCH };
  assert.equal(startProblem({ ...ready, worktree: { kind: "devspace", target, settingsReady: true, saving: false } }), null);
  const options = devspaceWorkspaceOptions({
    project: { id: "vps-project", root: "/home/ubuntu/workspaces/premier-store-os" },
    ticket: { identifier: "PSOS-6071", title: "Book checkout payments" },
    provider: "claude/opus", prompt: "Implement the ticket", target,
  });
  assert.equal(options.source.kind, "directory");
  assert.equal(options.source.path, "/home/ubuntu/workspaces/premier-store-os");
  assert.equal(options.agent.cwd, "/home/ubuntu/workspaces/premier-store-os");
  assert.ok(options.agent.prompt.includes(JSON.stringify(target.projectPath)));
  assert.match(options.agent.prompt, /project and Git repository are on the machine served by the configured DevSpace MCP/);
});
