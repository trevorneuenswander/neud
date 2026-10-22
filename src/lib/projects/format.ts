import {
  PROJECT_ACCESS_LEVEL_LABELS,
  PROJECT_DATA_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  type ProjectAccessLevelWithAdmin,
  type ProjectDataType,
  type ProjectStatus,
} from "@/lib/projects/constants";

export function formatProjectNumber(projectNumber: number): string {
  return `Project ${projectNumber}`;
}

export function formatProjectStatus(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function formatProjectDataType(dataType: ProjectDataType): string {
  return PROJECT_DATA_TYPE_LABELS[dataType] ?? dataType;
}

/** @deprecated Use formatProjectDataType */
export const formatProjectType = formatProjectDataType;

export function formatProjectAccessLevel(
  accessLevel: ProjectAccessLevelWithAdmin,
): string {
  return PROJECT_ACCESS_LEVEL_LABELS[accessLevel] ?? accessLevel;
}

/**
 * Format a project timestamp for UI. Missing/invalid values must never render as
 * Unix epoch (Dec 1969 / Jan 1970).
 */
export function formatProjectDate(value: string | number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return "—";
    }
    return new Date(value).toLocaleString();
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return "—";
  }
  const ms = Date.parse(trimmed);
  // Reject missing/invalid and Unix-epoch (renders as Dec 1969 / Jan 1970 locally).
  if (!Number.isFinite(ms) || ms <= 0) {
    return "—";
  }
  return new Date(ms).toLocaleString();
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}
