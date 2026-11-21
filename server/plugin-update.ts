import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { PluginUpdatePreview, PluginUpdateProposal, PluginUpdateResult } from "@getpaseo/protocol/messages";

const execute = promisify(execFile);
const PLUGIN_ID = "paseo-jira";
const MANUAL_COMMAND = "paseo plugin update paseo-jira";
const INSTALLED_MESSAGE = "Update installed. Reload Jira if it doesn’t refresh automatically.";
const REVIEW_AGAIN = "The update or installed plugin changed. Check for updates again before installing.";

type UpdateHost = {
  previewPluginUpdates(input: { pluginId: string }): Promise<PluginUpdatePreview[]>;
  applyPluginUpdates(proposals: PluginUpdateProposal[]): Promise<PluginUpdateResult[]>;
};

type CliResult = Pick<PluginUpdatePreview, "id" | "proposal"> & {
  outcome: PluginUpdatePreview["outcome"] | PluginUpdateResult["outcome"];
  error?: string;
  warning?: string;
};
type RunCli = (args: string[]) => Promise<CliResult[]>;

async function runPaseoCli(args: string[]): Promise<CliResult[]> {
  try {
    const { stdout } = await execute("paseo", ["plugin", "update", PLUGIN_ID, "--json", ...args], {
      timeout: 300_000,
      maxBuffer: 1_000_000,
      shell: process.platform === "win32",
      windowsHide: true,
    });
    const result = JSON.parse(stdout);
    if (!Array.isArray(result)) throw new Error("Paseo returned an invalid update result");
    return result;
  } catch (error) {
    // Paseo reports update failures in its JSON output as well as the exit code.
    if (error instanceof Error && "stdout" in error && typeof error.stdout === "string") {
      try {
        const result = JSON.parse(error.stdout);
        if (Array.isArray(result) && result.some((item) => item?.outcome === "error")) return result;
      } catch { /* Use the manual command below if the CLI did not return JSON. */ }
    }
    throw new Error(`Paseo could not run the update command. On the daemon host, run \`${MANUAL_COMMAND}\`.`);
  }
}

function hasUpdateApi(host: unknown): host is UpdateHost {
  return !!host && typeof (host as Partial<UpdateHost>).previewPluginUpdates === "function"
    && typeof (host as Partial<UpdateHost>).applyPluginUpdates === "function";
}

function apiFor(host: unknown) {
  if (hasUpdateApi(host)) return host;
  const plugins = (host as { plugins?: unknown } | null)?.plugins;
  return hasUpdateApi(plugins) ? plugins : null;
}

function displayUrl(value: string): string {
  if (!value.includes("://")) return value;
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href;
}

function describeProposal(proposal: PluginUpdateProposal) {
  const { identity, revision } = proposal.expected;
  const { target } = proposal;
  if (identity.kind !== target.kind) throw new Error("The update does not match the installed source");

  const source = identity.kind === "git"
    ? displayUrl(identity.remote)
    : `npm:${identity.packageName}`;
  if (!source) throw new Error("Paseo did not include an update source");
  const pluginSource = identity.pluginPath === "." ? source : `${source} (folder ${identity.pluginPath})`;
  const revisionLabel = target.kind === "git" ? target.commit : target.version;
  return {
    source: identity.registry
      ? `${identity.registry.id} via ${displayUrl(identity.registry.url)}\n${pluginSource}`
      : pluginSource,
    currentRevision: revision,
    targetRevision: revisionLabel,
  };
}

async function previewUpdate(host: unknown, runCli: RunCli) {
  const api = apiFor(host);
  const previews = api ? await api.previewPluginUpdates({ pluginId: PLUGIN_ID }) : await runCli(["--check"]);
  const preview = previews.find((item) => item?.id === PLUGIN_ID);
  if (!preview) throw new Error("Paseo did not return an update preview for paseo-jira");
  if (preview.outcome === "error") throw new Error(preview.error ?? "Paseo could not check for plugin updates");
  if (preview.outcome === "current") {
    return { status: "current" as const, message: "You are already on the latest version." };
  }
  if (preview.outcome === "installed-newer") {
    return { status: "current" as const, message: "The installed version is newer than the remote source." };
  }
  if (preview.outcome === "local") {
    return { status: "local" as const, message: "This is a directory installation. Update the source directory, then reload the plugin." };
  }
  if (preview.outcome !== "update" || preview.proposal?.id !== PLUGIN_ID) {
    throw new Error("Paseo did not include a Jira update proposal");
  }

  const { proposal } = preview;
  const details = describeProposal(proposal);
  const identity = proposal.expected.identity;
  const pinnedGit = !api && identity.kind === "git" && !identity.registry && proposal.target.kind === "git"
    && /^[a-f0-9]{40,64}$/.test(proposal.target.commit);
  // Registry updates must use the native CLI's current reviewed pin. The dialog
  // explicitly asks for the latest from that source when the CLI cannot pin a revision.
  const latestFromSource = !api && !pinnedGit;
  const confirmation = createHash("sha256").update(JSON.stringify([!!api, proposal])).digest("hex");
  return {
    status: "available" as const,
    details: { ...details, latestFromSource, confirmation },
    api,
    proposal,
    cliArgs: pinnedGit ? ["--ref", details.targetRevision] : ["--yes"],
  };
}

export async function checkJiraPluginUpdate(host: unknown, runCli: RunCli = runPaseoCli) {
  const update = await previewUpdate(host, runCli);
  if (update.status !== "available") return update;
  return { status: update.status, ...update.details };
}

export async function applyJiraPluginUpdate(host: unknown, confirmation: string, runCli: RunCli = runPaseoCli) {
  const update = await previewUpdate(host, runCli);
  if (update.status !== "available" || update.details.confirmation !== confirmation) {
    throw new Error(REVIEW_AGAIN);
  }

  const results = update.api
    ? await update.api.applyPluginUpdates([update.proposal])
    : await runCli(update.cliArgs);
  const applied = results.find((item) => item?.id === PLUGIN_ID);
  if (applied?.outcome !== "updated") {
    throw new Error(applied?.error ?? REVIEW_AGAIN);
  }
  return { status: "updated" as const, message: applied.warning ?? INSTALLED_MESSAGE };
}
