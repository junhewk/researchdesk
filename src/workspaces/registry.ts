import type { WorkspaceDefinition } from "./types";


const dashboardWorkspace: WorkspaceDefinition = {
  id: "dashboard",
  label: "Dashboard",
  href: "/",
  icon: "dashboard",
  matchPrefix: false,
};

const researchProjectsWorkspace: WorkspaceDefinition = {
  id: "researchProjects",
  label: "Research Projects",
  href: "/projects",
  icon: "researchProjects",
};

export const workspaceRegistry: WorkspaceDefinition[] = [
  dashboardWorkspace,
  researchProjectsWorkspace,
];
