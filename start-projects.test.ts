import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultDirectoryHost, directoryProjects, startProjects } from "./client/start-projects.ts";

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

test("directory choices include exact paths and deduplicate aliases of the same project", () => {
  const options = directoryProjects([
    { projectId: "one", projectKind: "git", projectRootPath: "/Users/name/Infras/app", projectDisplayName: "app", projectCustomName: "My app" },
    { projectId: "alias", projectKind: "git", projectRootPath: "/Users/name/Infras/app", projectDisplayName: "app alias" },
    { projectId: "other", projectKind: "non_git", projectRootPath: "/Users/name/Work Projects/tools", projectDisplayName: "tools" },
  ]);
  assert.deepEqual(options, [
    { path: "/Users/name/Infras/app", name: "My app" },
    { path: "/Users/name/Work Projects/tools", name: "tools" },
  ]);
});

test("directory browsing defaults to the other online computer without falling back to VPS", () => {
  assert.equal(defaultDirectoryHost([
    { serverId: "vps", status: "online" }, { serverId: "mac", status: "online" },
  ], "vps"), "mac");
  assert.equal(defaultDirectoryHost([
    { serverId: "vps", status: "online" }, { serverId: "mac", status: "offline" },
  ], "vps"), null);
  assert.equal(defaultDirectoryHost([
    { serverId: "vps", status: "online" }, { serverId: "mac", status: "online" }, { serverId: "other", status: "online" },
  ], "vps"), null);
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
