import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createJiraClient } from "./server/jira";
import { remoteBranches } from "./server/git";
import { updateJiraPlugin } from "./server/plugin-update";
import { assignRpc, jiraSettings, searchAssigneesRpc, listBoardsRpc, listTransitionsRpc, transitionRpc, listSprintsRpc, listTicketsRpc, remoteBranchesRpc, searchTicketsRpc, testConnectionRpc, ticketDetailsRpc, updatePluginRpc } from "./shared/jira";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(jiraSettings);

  async function jira() {
    const current = await settings.read();
    if (current.status !== "ready") throw new Error("Jira settings are invalid; reset them in Settings");
    return createJiraClient(current.values);
  }

  server.handle(searchTicketsRpc, async ({ query }) => (await jira()).search(query));
  server.handle(listTicketsRpc, async (input) => (await jira()).list(input));
  server.handle(ticketDetailsRpc, async ({ key }) => (await jira()).details(key));
  server.handle(listBoardsRpc, async () => (await jira()).boards());
  server.handle(listSprintsRpc, async () => (await jira()).sprints());
  server.handle(listTransitionsRpc, async ({ key }) => (await jira()).transitions(key));
  server.handle(transitionRpc, async ({ key, transitionId }) => (await jira()).transition(key, transitionId));
  server.handle(searchAssigneesRpc, async ({ key, query }) => (await jira()).assignees(key, query));
  server.handle(assignRpc, async ({ key, accountId }) => (await jira()).assign(key, accountId));
  server.handle(testConnectionRpc, async () => (await jira()).myself());
  server.handle(updatePluginRpc, (_input, { paseo }) => updateJiraPlugin(paseo));
  server.handle(remoteBranchesRpc, ({ cwd }) => remoteBranches(cwd));
  return () => {};
}
