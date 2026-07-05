import type { ReactNode } from "react";

export type WorkspaceIcon =
  | "dashboard"
  | "researchProjects"
  | "myArticles"
  | "methodsWorkbench";

export interface WorkspaceDefinition {
  id: "dashboard" | "researchProjects" | "myArticles" | "methodsWorkbench";
  label: string;
  href: string;
  icon: WorkspaceIcon;
  matchPrefix?: boolean;
  prunable?: boolean;
}

export interface SettingsField {
  label: string;
  placeholder: string;
}

export interface SettingsSection {
  title: string;
  caption: ReactNode;
  fields: SettingsField[];
}
