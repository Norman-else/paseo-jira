import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { SprintCompletionPlanSchema, type SprintCompletionPlan } from "../shared/jira";

type Request = (path: string, init?: RequestInit) => Promise<unknown>;
const SprintSchema = z.object({ id: z.number(), name: z.string(), state: z.string(), originBoardId: z.number() });
const IssueSchema = z.object({ id: z.string(), key: z.string(), fields: z.object({
  summary: z.string(), status: z.object({ id: z.string(), name: z.string(), statusCategory: z.object({ key: z.string() }) }),
  issuetype: z.object({ subtask: z.boolean() }), parent: z.object({ id: z.string(), key: z.string() }).nullish(),
  sprint: z.object({ id: z.number(), state: z.string() }).nullish(),
}) });
const IssuePageSchema = z.object({ issues: z.array(IssueSchema), isLast: z.boolean().optional(), nextPageToken: z.string().nullish() });
const RecordSchema = z.object({ plan: SprintCompletionPlanSchema, phase: z.enum(["confirmed", "closed", "finished"]), moved: z.array(z.string()) });
type Record = z.infer<typeof RecordSchema>;
export type CompletionStore = { key: string; read(sprintId: number): Promise<Record | null>; write(sprintId: number, value: Record): Promise<void> };
const running = new Set<string>();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** A small recovery receipt survives plugin reloads if Jira closes the sprint before a move fails. */
export function completionStore(site: string, email: string): CompletionStore {
  const key = digest([site, email]);
  const directory = join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "plugin-data", "paseo-jira", "sprint-completions", key);
  return {
    key,
    async read(id) {
      try { return RecordSchema.parse(JSON.parse(await readFile(join(directory, `${id}.json`), "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async write(id, value) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = join(directory, `${id}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
      await rename(temporary, join(directory, `${id}.json`));
    },
  };
}

export function createSprintCompletion(request: Request, store: CompletionStore) {
  async function issues(sprintId: number) {
    const found = new Map<string, z.infer<typeof IssueSchema>>();
    const seen = new Set<string>();
    let token: string | undefined;
    do {
      const params = new URLSearchParams({ fields: "summary,status,issuetype,parent,sprint", maxResults: "100" });
      if (token) params.set("nextPageToken", token);
      const page = IssuePageSchema.parse(await request(`/rest/software/1.0/sprint/${sprintId}/issue?${params}`));
      for (const issue of page.issues) found.set(issue.id, issue);
      if (page.isLast === true || !page.nextPageToken) {
        if (page.isLast === false) throw new Error("Jira did not return the next issue page. Refresh and try again.");
        break;
      }
      if (seen.has(page.nextPageToken)) throw new Error("Jira repeated an issue page. Refresh and try again.");
      seen.add(page.nextPageToken);
      token = page.nextPageToken;
    } while (token);
    return [...found.values()];
  }

  async function activePlan(sprint: z.infer<typeof SprintSchema>): Promise<SprintCompletionPlan> {
    if (sprint.state !== "active") throw new Error("Only an active sprint can be completed. Refresh the sprint list.");
    const [all, board, next] = await Promise.all([
      issues(sprint.id),
      request(`/rest/agile/1.0/board/${sprint.originBoardId}`).then((value) => z.object({ name: z.string() }).parse(value)),
      nextSprint(sprint.originBoardId),
    ]);
    const incomplete = all.filter((issue) => issue.fields.status.statusCategory.key !== "done").map((issue) => ({
      id: issue.id, key: issue.key, title: issue.fields.summary, status: issue.fields.status.name, statusId: issue.fields.status.id,
      parentKey: issue.fields.issuetype.subtask ? issue.fields.parent?.key ?? "Unknown parent" : null,
    })).sort((a, b) => a.key.localeCompare(b.key));
    const orphan = incomplete.find((issue) => issue.parentKey && !incomplete.some((parent) => parent.key === issue.parentKey && !parent.parentKey));
    const conflicting = all.find((issue) => issue.fields.status.statusCategory.key !== "done" &&
      issue.fields.sprint && issue.fields.sprint.state !== "closed" &&
      issue.fields.sprint.id !== sprint.id && issue.fields.sprint.id !== next?.id);
    const body = {
      sprintId: sprint.id, sprintName: sprint.name, boardId: sprint.originBoardId, boardName: board.name,
      totalCount: all.length, doneCount: all.length - incomplete.length, incomplete,
      destination: next ? { id: next.id, name: next.name } : null,
      blockedReason: orphan ? `${orphan.key} is an unfinished subtask whose parent is Done or outside this sprint. Resolve it in Jira before completing.` :
        conflicting ? `${conflicting.key} is already assigned to another sprint. Review it in Jira before completing.` : null,
    };
    return { ...body, confirmation: digest(body), recovering: false, finished: false };
  }

  async function nextSprint(boardId: number) {
    for (let startAt = 0; ; startAt += 50) {
      const page = z.object({ values: z.array(SprintSchema), isLast: z.boolean().optional() }).parse(
        await request(`/rest/agile/1.0/board/${boardId}/sprint?state=future&maxResults=50&startAt=${startAt}`),
      );
      const next = page.values.find((sp) => sp.state === "future" && sp.originBoardId === boardId);
      if (next) return next;
      if (page.isLast !== false || !page.values.length) return null;
    }
  }

  async function preview(sprintId: number) {
    const sprint = SprintSchema.parse(await request(`/rest/agile/1.0/sprint/${sprintId}`));
    const receipt = await store.read(sprintId);
    if (sprint.state === "closed" && receipt) {
      return { ...receipt.plan, recovering: receipt.phase !== "finished", finished: receipt.phase === "finished" };
    }
    return activePlan(sprint);
  }

  async function complete(sprintId: number, confirmation: string) {
    const lock = `${store.key}:${sprintId}`;
    if (running.has(lock)) throw new Error("This sprint is already being completed. Wait and refresh.");
    running.add(lock);
    try {
      const sprint = SprintSchema.parse(await request(`/rest/agile/1.0/sprint/${sprintId}`));
      let receipt = await store.read(sprintId);
      if (sprint.state === "active") {
        const plan = await activePlan(sprint);
        if (plan.confirmation !== confirmation) throw new Error("The unfinished issues or destination changed. Refresh the preview and confirm the updated plan.");
        if (plan.blockedReason) throw new Error(plan.blockedReason);
        receipt = { plan, phase: "confirmed", moved: [] };
        await store.write(sprintId, receipt);
        // Close first so carried work remains in the closed sprint's history and reports.
        await request(`/rest/agile/1.0/sprint/${sprintId}`, { method: "POST", body: JSON.stringify({ state: "closed" }) });
        const closed = SprintSchema.parse(await request(`/rest/agile/1.0/sprint/${sprintId}`));
        if (closed.state !== "closed") throw new Error("Jira has not confirmed that the sprint is closed. Refresh before retrying.");
      } else if (sprint.state !== "closed" || !receipt || receipt.plan.confirmation !== confirmation) {
        throw new Error("The sprint or confirmation changed. Refresh the completion preview.");
      }
      if (!receipt) throw new Error("No confirmed completion plan was found.");
      if (receipt.phase === "finished") return { ok: true as const };
      receipt.phase = "closed";
      await store.write(sprintId, receipt);
      try {
        const { plan } = receipt;
        if (plan.incomplete.length) {
          if (plan.destination) {
            const target = SprintSchema.parse(await request(`/rest/agile/1.0/sprint/${plan.destination.id}`));
            if (target.state !== "future" || target.originBoardId !== plan.boardId) throw new Error("The confirmed destination sprint is no longer upcoming on this board. Review the remaining work in Jira.");
          }
          const current = new Map((await issues(sprintId)).map((issue) => [issue.id, issue]));
          for (const child of plan.incomplete.filter((item) => item.parentKey)) {
            const live = current.get(child.id);
            const parent = [...current.values()].find((item) => item.key === child.parentKey);
            if (!live) throw new Error(`${child.key} is no longer visible. Review it in Jira before retrying.`);
            if (live?.fields.status.statusCategory.key !== "done" && parent?.fields.status.statusCategory.key === "done") {
              throw new Error(`${child.key}'s parent became Done. Review this unfinished subtask in Jira.`);
            }
          }
          const pending: string[] = [];
          for (const issue of plan.incomplete.filter((item) => !item.parentKey && !receipt!.moved.includes(item.id))) {
            const live = current.get(issue.id);
            if (!live) throw new Error(`${issue.key} is no longer visible. Review it in Jira before retrying.`);
            if (live.fields.status.statusCategory.key === "done") continue;
            const assigned = live.fields.sprint;
            if (assigned && assigned.state !== "closed" && assigned.id !== plan.destination?.id) {
              throw new Error(`${issue.key} was assigned to another sprint. Review it in Jira before retrying.`);
            }
            if (!assigned || assigned.state === "closed") pending.push(issue.id);
          }
          for (let offset = 0; offset < pending.length; offset += 50) {
            const batch = pending.slice(offset, offset + 50);
            const path = plan.destination ? `/rest/agile/1.0/sprint/${plan.destination.id}/issue` : "/rest/agile/1.0/backlog/issue";
            const result = await request(path, { method: "POST", body: JSON.stringify({ issues: batch }) });
            if (result !== null) throw new Error("Jira did not confirm the full issue move. Review the remaining work before retrying.");
            receipt.moved.push(...batch);
            await store.write(sprintId, receipt);
          }
        }
        receipt.phase = "finished";
        await store.write(sprintId, receipt);
        return { ok: true as const };
      } catch (error) {
        throw new Error(`Sprint closed, but moving unfinished work is not complete. Retry to resume the confirmed move. ${(error as Error).message}`);
      }
    } finally { running.delete(lock); }
  }
  return { preview, complete };
}
