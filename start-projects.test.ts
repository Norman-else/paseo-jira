import assert from "node:assert/strict";
import { test } from "node:test";
import { startProjects } from "./client/start-projects.ts";

test("remote directory projects remain selectable without advertising Git worktrees", () => {
  const projects = startProjects([
    {
      projectId: "remote-mcp",
      projectKind: "non_git",
      projectRootPath: "/home/ubuntu/workspaces/mercaso-connector",
      projectDisplayName: "mercaso-connector",
    },
    {
      projectId: "directory",
      projectKind: "directory",
      projectRootPath: "/home/ubuntu/workspaces/premier-store-os",
      projectDisplayName: "premier-store-os",
    },
  ]);

  assert.deepEqual(projects.map((project) => project.id), ["remote-mcp", "directory"]);
  assert.equal(projects[0].root, "/home/ubuntu/workspaces/mercaso-connector");
  assert.ok(projects.every((project) => !project.supportsWorktree));
});

test("Git projects keep their custom names and worktree capability alongside directories", () => {
  const projects = startProjects([
    {
      projectId: "git",
      projectKind: "git",
      projectRootPath: "/Users/normanzuo/PersonalRepos/paseo-jira",
      projectDisplayName: "paseo-jira",
      projectCustomName: "Jira plugin",
    },
    {
      projectId: "mcp",
      projectKind: "non_git",
      projectRootPath: "/home/ubuntu/agent-sessions/mac-devspace",
      projectDisplayName: "mac-devspace",
    },
  ]);

  assert.equal(projects.length, 2);
  assert.equal(projects[0].name, "Jira plugin");
  assert.equal(projects[0].supportsWorktree, true);
  assert.equal(projects[1].supportsWorktree, false);
});
