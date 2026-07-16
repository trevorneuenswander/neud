import {
  PROJECT_ACCESS_LEVEL_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectAccessLevelWithAdmin,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/projects/constants";

export function formatProjectNumber(projectNumber: number): string {
  return `Project ${projectNumber}`;
}

export function formatProjectStatus(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function formatProjectType(projectType: ProjectType): string {
  return PROJECT_TYPE_LABELS[projectType] ?? projectType;
}

export function formatProjectAccessLevel(
  accessLevel: ProjectAccessLevelWithAdmin,
): string {
  return PROJECT_ACCESS_LEVEL_LABELS[accessLevel] ?? accessLevel;
}

export function formatProjectDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}
