interface Project {
  projectId: string;
  projectKind: string;
  projectRootPath: string;
  projectDisplayName: string;
  projectCustomName?: string | null;
}

export function startProjects(projects: readonly Project[]) {
  return projects.map((project) => ({
    id: project.projectId,
    name: project.projectCustomName || project.projectDisplayName,
    root: project.projectRootPath,
    supportsWorktree: project.projectKind === "git",
  }));
}

export function directoryProjects(projects: readonly Project[]) {
  const directories = new Map<string, { path: string; name: string }>();
  for (const project of startProjects(projects)) {
    if (project.root && !directories.has(project.root)) {
      directories.set(project.root, { path: project.root, name: project.name });
    }
  }
  return [...directories.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function defaultDirectoryHost(hosts: readonly { serverId: string; status: string }[], launchHostId: string) {
  const others = hosts.filter((host) => host.status === "online" && host.serverId !== launchHostId);
  return others.length === 1 ? others[0].serverId : null;
}
