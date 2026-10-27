import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const PLUGIN_ID = "paseo-jira";
const MANUAL_COMMAND = "paseo plugin update paseo-jira";

type UpdateResult = {
  status: "updated" | "current" | "local" | "completed";
  message: string;
};

type Preview = {
  id: string;
  outcome: string;
  proposal?: unknown;
  error?: string;
};

type ApplyResult = {
  id: string;
  outcome: string;
  error?: string;
  warning?: string;
};

type SourceUpdate = {
  id: string;
  updated: boolean;
};

type UpdateHost = {
  previewPluginUpdates?(input: { pluginId: string }): Promise<Preview[]>;
  applyPluginUpdates?(proposals: unknown[]): Promise<ApplyResult[]>;
  updatePluginSources?(pluginId: string): Promise<SourceUpdate[]>;
};

function updateHosts(host: unknown): UpdateHost[] {
  if (typeof host !== "object" || host === null) return [];
  const plugins = (host as { plugins?: unknown }).plugins;
  return [host as UpdateHost, ...(typeof plugins === "object" && plugins !== null ? [plugins as UpdateHost] : [])];
}

async function runPaseoCli() {
  await execute("paseo", ["plugin", "update", PLUGIN_ID], {
    timeout: 300_000,
    maxBuffer: 1_000_000,
    shell: process.platform === "win32",
    windowsHide: true,
  });
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export async function updateJiraPlugin(host: unknown, runCli: () => Promise<void> = runPaseoCli): Promise<UpdateResult> {
  const hosts = updateHosts(host);
  const modern = hosts.find((candidate) =>
    typeof candidate.previewPluginUpdates === "function" && typeof candidate.applyPluginUpdates === "function");

  if (modern) {
    const previews = await modern.previewPluginUpdates!({ pluginId: PLUGIN_ID });
    const preview = previews.find((item) => item.id === PLUGIN_ID);
    if (!preview) throw new Error("Paseo did not return an update preview for paseo-jira");
    if (preview.outcome === "current") return { status: "current", message: "You are already on the latest version." };
    if (preview.outcome === "installed-newer") {
      return { status: "current", message: "The installed version is newer than the remote source." };
    }
    if (preview.outcome === "local") {
      return { status: "local", message: "This is a directory installation. Update the source directory, then reload the plugin." };
    }
    if (preview.outcome === "error") throw new Error(preview.error ?? "Paseo could not check for plugin updates");
    if (preview.outcome !== "update") throw new Error(`Unsupported Paseo update preview outcome: ${preview.outcome}`);
    if (!preview.proposal) throw new Error("Paseo did not include an update proposal");

    const results = await modern.applyPluginUpdates!([preview.proposal]);
    const applied = results.find((item) => item.id === PLUGIN_ID);
    if (!applied || applied.outcome !== "updated") {
      throw new Error(applied?.error ?? "Paseo did not apply the plugin update");
    }
    return {
      status: "updated",
      message: applied.warning ?? "Jira plugin updated. Reopen the Jira screen if Paseo does not refresh it automatically.",
    };
  }

  const legacy = hosts.find((candidate) => typeof candidate.updatePluginSources === "function");
  if (legacy) {
    const updates = await legacy.updatePluginSources!(PLUGIN_ID);
    const update = updates.find((item) => item.id === PLUGIN_ID);
    if (!update) throw new Error("Paseo did not return an update result for paseo-jira");
    return update.updated
      ? { status: "updated", message: "Jira plugin updated. Reopen the Jira screen if Paseo does not refresh it automatically." }
      : { status: "current", message: "You are already on the latest version." };
  }

  const partialModern = hosts.some((candidate) =>
    typeof candidate.previewPluginUpdates === "function" || typeof candidate.applyPluginUpdates === "function");
  if (partialModern) {
    throw new Error(`Paseo exposes an incomplete plugin update API. Update Paseo or run \`${MANUAL_COMMAND}\` manually.`);
  }

  try {
    await runCli();
    return {
      status: "completed",
      message: "Update check completed. Reopen the Jira screen if Paseo does not refresh it automatically.",
    };
  } catch (error) {
    throw new Error(`Automatic update failed. Run \`${MANUAL_COMMAND}\` on the Paseo daemon host. ${errorMessage(error)}`.trim());
  }
}
