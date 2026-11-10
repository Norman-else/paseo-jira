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
