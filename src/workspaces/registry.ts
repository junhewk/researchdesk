import type { WorkspaceDefinition } from "./types";


const dashboardWorkspace: WorkspaceDefinition = {
  id: "dashboard",
  label: "Dashboard",
  href: "/",
  icon: "dashboard",
  matchPrefix: false,
};

const myArticlesWorkspace: WorkspaceDefinition = {
  id: "myArticles",
  label: "My Articles",
  href: "/my-articles",
  icon: "myArticles",
};

const methodsWorkbenchWorkspace: WorkspaceDefinition = {
  id: "methodsWorkbench",
  label: "Methods Workbench",
  href: "/methods-workbench",
  icon: "methodsWorkbench",
};

export const workspaceRegistry: WorkspaceDefinition[] = [
  dashboardWorkspace,
  methodsWorkbenchWorkspace,
  myArticlesWorkspace,
];
