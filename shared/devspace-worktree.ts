export interface DevspaceTarget {
  projectPath: string;
  baseRef: string;
}

// A UI preference resolved by the agent on the actual DevSpace repository, never a Git ref.
export const DEVSPACE_DEFAULT_BRANCH = "@default-branch";

export function devspaceTargetError(target: DevspaceTarget): string | null {
  const path = target.projectPath.trim();
  if ((!path.startsWith("/") && !path.startsWith("~/")) || /[\x00-\x1f\x7f]/.test(path)) {
    return "Enter the project's absolute path on the DevSpace machine, such as /Users/name/work/project.";
  }
  const ref = target.baseRef.trim();
  if (!ref || ref.startsWith("-") || /\s|[\x00-\x1f\x7f]/.test(ref)) {
    return "Enter a base ref, such as HEAD or origin/master.";
  }
  return null;
}

export function devspaceWorktreePrompt(input: DevspaceTarget & { branchName: string; taskPrompt: string }): string {
  const error = devspaceTargetError(input);
  if (error) throw new Error(error);
  const request = {
    path: input.projectPath.trim(),
    mode: "worktree",
    base_ref: input.baseRef.trim(),
  };
  const defaultBranch = request.base_ref === DEVSPACE_DEFAULT_BRANCH;
  return [
    "Prepare an isolated DevSpace worktree before starting the task below.",
    "The agent is running on the Paseo host, but the project and Git repository are on the machine served by the configured DevSpace MCP. The Paseo working directory is only a session container.",
    `Target project: ${JSON.stringify(request.path)}. Requested task branch: ${JSON.stringify(input.branchName)}.`,
    "1. Find the configured DevSpace MCP and call its open_workspace for the exact target path in checkout mode. Read the returned project instructions and use its MCP command tool to check Git status. Leave the source checkout, its branch and all uncommitted changes untouched; those changes are not copied into the worktree.",
    defaultBranch
      ? "2. Through the DevSpace MCP in that source workspace, fetch origin, then run git ls-remote --symref origin HEAD to discover the remote's actual default branch. Resolve its refs/heads/<branch> to origin/<branch> and verify refs/remotes/origin/<branch>^{commit}. If it is not fetched by the configured refspec, fetch that specific branch first. Use this freshly fetched remote-tracking ref. Do not guess master or main and do not fall back to HEAD; if discovery or fetching fails, stop and report the error."
      : `2. If the requested base ref ${JSON.stringify(request.base_ref)} is an origin/ remote-tracking ref, fetch origin through the DevSpace MCP in that source workspace first. Do not substitute a different ref.`,
    defaultBranch
      ? `3. Call the same DevSpace MCP open_workspace with ${JSON.stringify({ path: request.path, mode: request.mode })} and add base_ref set to the concrete origin/<branch> resolved in step 2. Do not pass a placeholder or preference name as base_ref.`
      : `3. Call the same DevSpace MCP open_workspace with exactly these arguments: ${JSON.stringify(request)}.`,
    "4. Capture the NEW workspace_id and returned worktree root. Every subsequent project read, edit, Git command, test and review must use that new workspace_id through the same DevSpace MCP. Do not reopen the source checkout for task edits.",
    `5. In the new worktree only, create and switch to branch ${JSON.stringify(input.branchName)}. If that branch already exists or is in use, stop and report the conflict; never reset, overwrite, delete or force-switch a branch.`,
    "6. Before editing, report the source path, worktree path, workspace_id, task branch and starting commit. If MCP access, the base ref or worktree setup fails, stop and report the exact error. Do not fall back to editing the source checkout or the Paseo host's directory.",
    "7. Perform the task in the new DevSpace workspace, run appropriate checks there, and call show_changes after the final related file change. The Paseo host's native Git diff does not represent this remote worktree; use DevSpace review or Git on the project machine.",
    "",
    "Task:",
    input.taskPrompt,
  ].join("\n\n");
}

export function devspaceWorkspaceOptions<Attachment>(input: {
  project: { id: string; root: string };
  ticket: { identifier: string; title: string };
  provider: string;
  prompt: string;
  target: DevspaceTarget;
  attachments?: Attachment[];
}) {
  return {
    source: { kind: "directory" as const, path: input.project.root, projectId: input.project.id },
    title: `${input.ticket.identifier} ${input.ticket.title}`,
    agent: {
      cwd: input.project.root,
      config: { provider: input.provider },
      prompt: devspaceWorktreePrompt({ ...input.target, branchName: input.ticket.identifier, taskPrompt: input.prompt }),
      attachments: input.attachments,
      title: input.ticket.identifier,
    },
  };
}
