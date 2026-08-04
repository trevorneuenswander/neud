export type ProjectScraperSource = {
  projectId: string;
  projectName?: string;
  language: "javascript" | "typescript";
  entryFilename: string;
  draftSource: string;
  publishedSource: string;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  isDirty: boolean;
  updatedAt: string;
  updatedBy: string | null;
  draftSavedAt: string | null;
};

export type ProjectDisplaySource = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  displayKey: string;
  description: string | null;
  sourceType: "built-in" | "project-html";
  enabled: boolean;
  archived: boolean;
  draftHtml: string | null;
  draftCss: string | null;
  draftJavascript: string | null;
  publishedRevisionId: string | null;
  isDirty: boolean;
  updatedAt: string;
  updatedBy: string | null;
  draftSavedAt: string | null;
};

export type ProjectCodeRevision = {
  id: string;
  projectId: string;
  resourceType: "scraper" | "display";
  resourceId: string;
  revisionName: string | null;
  changeNote: string | null;
  message: string | null;
  sourceHash: string;
  validationStatus: "valid" | "invalid" | "not-validated";
  versionNumber?: number | null;
  createdAt: string;
  createdBy: string;
  createdByName?: string | null;
  isActive?: boolean;
};

export type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
  line?: number;
};

export type ValidationResult = {
  ok: boolean;
  status: "valid" | "invalid";
  issues: ValidationIssue[];
};

export type SaveCodeDraftRequest = {
  baseRevisionId: string | null;
  source?: string;
  html?: string;
  css?: string;
  javascript?: string;
  message?: string;
};

export type DisplayTemplateId =
  | "blank"
  | "transparent-overlay"
  | "lower-third"
  | "ticker"
  | "scoreboard"
  | "duplicate";
