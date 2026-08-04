export const PROJECT_STATUSES = [
  "draft",
  "active",
  "maintenance",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** All stored `project_type` enum values, including legacy entries. */
export const ALL_PROJECT_DATA_TYPES = [
  "webpage-scraper",
  "json-ingest",
  "google-sheet-ingest",
  "bag-graphics",
] as const;

export type ProjectDataType = (typeof ALL_PROJECT_DATA_TYPES)[number];

/** Data types offered when creating a new Project. */
export const CREATABLE_PROJECT_DATA_TYPES = [
  "webpage-scraper",
  "json-ingest",
  "google-sheet-ingest",
] as const;

export type CreatableProjectDataType =
  (typeof CREATABLE_PROJECT_DATA_TYPES)[number];

export const PROJECT_ACCESS_LEVELS = [
  "manager",
  "operator",
  "viewer",
] as const;

export type ProjectAccessLevel = (typeof PROJECT_ACCESS_LEVELS)[number];

export type ProjectAccessLevelWithAdmin = ProjectAccessLevel | "admin";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  maintenance: "Maintenance",
  archived: "Archived",
};

export const PROJECT_DATA_TYPE_LABELS: Record<ProjectDataType, string> = {
  "webpage-scraper": "Webpage Scraper",
  "json-ingest": "JSON Ingest",
  "google-sheet-ingest": "Google Sheet Ingest",
  "bag-graphics": "BAG Graphics",
};

export const PROJECT_ACCESS_LEVEL_LABELS: Record<
  ProjectAccessLevelWithAdmin,
  string
> = {
  admin: "Platform Admin",
  manager: "Manager",
  operator: "Operator",
  viewer: "Viewer",
};

export function projectSupportsBagController(projectType: string): boolean {
  return projectType === "bag-graphics";
}

export const DEFAULT_PROJECT_THEME = "default";
export const DEFAULT_PROJECT_ICON = "folder";

export const MAX_PROJECT_NAME_LENGTH = 120;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 2000;
export const MAX_PROJECT_ICON_LENGTH = 64;
export const MAX_PROJECT_THEME_LENGTH = 64;
export const MAX_LOGO_URL_LENGTH = 2048;
