export const NEUD_IMPORT_VERSION = 1 as const;

export const SUPPORTED_ENGINE_TYPES = ["webpage-scraper"] as const;
export const SUPPORTED_EXECUTION_MODES = ["local-desktop", "remote-worker"] as const;
export const SUPPORTED_DESIRED_STATES = ["running", "stopped"] as const;

export type ImportProjectAction = "create" | "skip" | "copy";

export type ImportProjectStatus =
  | "new"
  | "already-imported"
  | "source-updated"
  | "id-conflict"
  | "name-conflict"
  | "invalid"
  | "active-conflict";

export type ImportValidationIssue = {
  path: string;
  message: string;
};

export type ImportValidationResult = {
  valid: boolean;
  errors: ImportValidationIssue[];
  warnings: ImportValidationIssue[];
};

export type NeudScraperSourceImport = {
  id: string;
  name: string;
  sourceKey: string;
  url: string;
  pageType: string;
  enabled: boolean;
  position: number;
  config: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type NeudEngineSettingsImport = {
  pollIntervalMs: number;
  detailsTtlMs: number;
  maxDetailChecksPerPoll: number;
  headless: boolean;
};

export type NeudSnapshotImport = {
  id?: string;
  data: Record<string, unknown>;
  recordCount?: number | null;
  payloadSizeBytes?: number | null;
  durationMs?: number | null;
  capturedAt?: string;
  createdAt?: string;
};

export type NeudEngineImport = {
  id: string;
  name: string;
  engineKey: string;
  engineType: string;
  enabled: boolean;
  desiredState: string;
  executionMode: string;
  config: Record<string, unknown>;
  settings: NeudEngineSettingsImport | null;
  scraperSources: NeudScraperSourceImport[];
  latestSnapshot: NeudSnapshotImport | null;
  createdAt?: string;
  updatedAt?: string;
};

export type NeudProjectImportRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  projectType: string;
  status: string;
  displayToken?: string | null;
  theme?: string | null;
  icon?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  engines: NeudEngineImport[];
};

export type NeudImportPackage = {
  version: typeof NEUD_IMPORT_VERSION;
  exportedAt: string;
  source: "supabase";
  projects: NeudProjectImportRecord[];
};

export type ImportPreviewProject = {
  sourceProjectId: string;
  name: string;
  slug: string;
  engineCount: number;
  scraperSourceCount: number;
  snapshotCount: number;
  status: ImportProjectStatus;
  recommendedAction: ImportProjectAction;
  allowedActions: ImportProjectAction[];
  selectedAction: ImportProjectAction;
  messages: string[];
};

export type ImportPreviewResult = {
  package: NeudImportPackage;
  validation: ImportValidationResult;
  totals: {
    projects: number;
    engines: number;
    scraperSources: number;
    snapshots: number;
  };
  projects: ImportPreviewProject[];
};

export type ImportExecuteSelection = {
  sourceProjectId: string;
  action: ImportProjectAction;
};

export type ImportExecuteProjectResult = {
  sourceProjectId: string;
  action: ImportProjectAction;
  status: "imported" | "copied" | "skipped" | "failed";
  localProjectId?: string;
  localSlug?: string;
  message?: string;
};

export type ImportExecuteResult = {
  ok: boolean;
  backupPath: string | null;
  importedProjects: number;
  copiedProjects: number;
  skippedProjects: number;
  importedEngines: number;
  importedScraperSources: number;
  importedSnapshots: number;
  projects: ImportExecuteProjectResult[];
  warnings: ImportValidationIssue[];
  errors: ImportValidationIssue[];
};

export type ImportIdMaps = {
  projectIdMap: Map<string, string>;
  engineIdMap: Map<string, string>;
  scraperSourceIdMap: Map<string, string>;
};
