import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd, timeout: 120_000 });
  return stdout.trim();
}

/** Fetches origin and lists its branches (e.g. `origin/main`), plus origin's default branch. */
export async function remoteBranches(cwd: string): Promise<{ defaultBranch: string | null; branches: string[] }> {
  await git(cwd, ["fetch", "--prune", "origin"]);
  const branches = (await git(cwd, ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]))
    .split("\n")
    .filter((b) => b && b !== "origin/HEAD" && b !== "origin");
  const head = await git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "");
  const defaultBranch = [head, "origin/main", "origin/master"].find((b) => b && branches.includes(b)) ?? null;
  return { defaultBranch, branches };
}
