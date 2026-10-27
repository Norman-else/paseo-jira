import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createJiraClient } from "./server/jira";
import { remoteBranches } from "./server/git";
import { jiraSettings, listBoardsRpc, listSprintsRpc, listTicketsRpc, remoteBranchesRpc, searchTicketsRpc, testConnectionRpc } from "./shared/jira";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(jiraSettings);

  async function jira() {
    const current = await settings.read();
    if (current.status !== "ready") throw new Error("Jira settings are invalid; reset them in Settings");
    return createJiraClient(current.values);
  }

  server.handle(searchTicketsRpc, async ({ query }) => (await jira()).search(query));
  server.handle(listTicketsRpc, async (input) => (await jira()).list(input));
  server.handle(listBoardsRpc, async () => (await jira()).boards());
  server.handle(listSprintsRpc, async () => (await jira()).sprints());
  server.handle(testConnectionRpc, async () => (await jira()).myself());
  server.handle(remoteBranchesRpc, ({ cwd }) => remoteBranches(cwd));
  return () => {};
}
