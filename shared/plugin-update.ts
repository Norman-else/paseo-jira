export function pluginRestartResult(error: unknown) {
  if (!(error instanceof Error) || !/\bPlugin stopped:\s*paseo-jira\b/.test(error.message)) return null;
  return {
    status: "completed" as const,
    message: "Paseo restarted Jira to finish the update. Reopen this page if needed.",
  };
}
