import { hashCanonicalProjectDataForPublish } from "../../publishing/hash";
import type { CanonicalProjectData } from "../../displays/canonical-project-data";

export const CANONICAL_PIPELINE_DIAGNOSTICS_KEY = "canonical.pipelineDiagnostics";
export const CANONICAL_PROJECT_PIPELINE_KEY = (projectId: string) =>
  `canonical.pipeline.project.${projectId}`;

export type CanonicalStructuralGroup =
  | "current"
  | "next"
  | "prev"
  | "lots"
  | "lastSold"
  | "auctionDisplay"
  | "dataSource";

export type CanonicalPipelineDiagnostics = {
  selectedDataSource: string | null;
  controllerStateRevision: number;
  scraperStateRevision: number;
  canonicalSourceUsed: string | null;
  localCanonicalRevision: number | null;
  localCanonicalDigestPrefix: string | null;
  lastControllerChangeAt: string | null;
  lastControllerActionType: string | null;
  lastScraperChangeAt: string | null;
  lastCanonicalInputChangedAt: string | null;
  lastCanonicalRegeneratedAt: string | null;
  lastCanonicalDigestChangedAt: string | null;
  lastCanonicalPublicationRequestedAt: string | null;
  lastCanonicalPublicationTriggerReason: string | null;
  lastCanonicalStructuralGroups: CanonicalStructuralGroup[];
  lastChangedStructuralGroups: CanonicalStructuralGroup[];
  lastHeartbeatCycleAt: string | null;
  lastOnlineViewerReconcileAt: string | null;
  inactiveSourceStateStaged: boolean | null;
  updatedAt: string;
};

export type ProjectCanonicalPublishDiagnostics = {
  lastCanonicalPublicationAttemptAt: string | null;
  lastCanonicalPublicationResult: string | null;
  lastCanonicalPublishedRevision: number | null;
  lastCanonicalPublishedHashPrefix: string | null;
  lastCanonicalNoChangeAt: string | null;
  lastCanonicalFailureCode: string | null;
  lastCanonicalPublishRequestedAt: string | null;
  lastCanonicalPublishReason: string | null;
  canonicalPublicationPending: boolean;
  canonicalPublicationInProgress: boolean;
  canonicalPublicationFollowUpRequested: boolean;
  updatedAt: string;
};

export function createDefaultCanonicalPipelineDiagnostics(): CanonicalPipelineDiagnostics {
  return {
    selectedDataSource: null,
    controllerStateRevision: 0,
    scraperStateRevision: 0,
    canonicalSourceUsed: null,
    localCanonicalRevision: null,
    localCanonicalDigestPrefix: null,
    lastControllerChangeAt: null,
    lastControllerActionType: null,
    lastScraperChangeAt: null,
    lastCanonicalInputChangedAt: null,
    lastCanonicalRegeneratedAt: null,
    lastCanonicalDigestChangedAt: null,
    lastCanonicalPublicationRequestedAt: null,
    lastCanonicalPublicationTriggerReason: null,
    lastCanonicalStructuralGroups: [],
    lastChangedStructuralGroups: [],
    lastHeartbeatCycleAt: null,
    lastOnlineViewerReconcileAt: null,
    inactiveSourceStateStaged: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function createDefaultProjectCanonicalPublishDiagnostics(): ProjectCanonicalPublishDiagnostics {
  return {
    lastCanonicalPublicationAttemptAt: null,
    lastCanonicalPublicationResult: null,
    lastCanonicalPublishedRevision: null,
    lastCanonicalPublishedHashPrefix: null,
    lastCanonicalNoChangeAt: null,
    lastCanonicalFailureCode: null,
    lastCanonicalPublishRequestedAt: null,
    lastCanonicalPublishReason: null,
    canonicalPublicationPending: false,
    canonicalPublicationInProgress: false,
    canonicalPublicationFollowUpRequested: false,
    updatedAt: new Date(0).toISOString(),
  };
}

function digestPrefixForSnapshot(snapshot: CanonicalProjectData | null): string | null {
  if (!snapshot) {
    return null;
  }
  return hashCanonicalProjectDataForPublish(snapshot).slice(0, 12);
}

function stableGroupFingerprint(value: unknown): string {
  if (value == null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((entry) =>
        entry && typeof entry === "object" ? stableGroupFingerprint(entry) : entry,
      ),
    );
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableGroupFingerprint(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintCanonicalStructuralGroups(
  snapshot: CanonicalProjectData | null,
): CanonicalStructuralGroup[] {
  if (!snapshot) {
    return [];
  }

  const groups: CanonicalStructuralGroup[] = [];
  if (snapshot.current) groups.push("current");
  if (snapshot.next?.length) groups.push("next");
  if (snapshot.prev) groups.push("prev");
  if (snapshot.lots?.length) groups.push("lots");
  if (snapshot.lastSold) groups.push("lastSold");
  if (snapshot.auctionDisplay) groups.push("auctionDisplay");
  if (snapshot.dataSource) groups.push("dataSource");
  return groups;
}

export function diffCanonicalStructuralGroups(
  previous: CanonicalProjectData | null,
  next: CanonicalProjectData | null,
): CanonicalStructuralGroup[] {
  const groups: CanonicalStructuralGroup[] = [
    "current",
    "next",
    "prev",
    "lots",
    "lastSold",
    "auctionDisplay",
    "dataSource",
  ];
  const changed: CanonicalStructuralGroup[] = [];

  for (const group of groups) {
    const previousFingerprint = stableGroupFingerprint(previous?.[group] ?? null);
    const nextFingerprint = stableGroupFingerprint(next?.[group] ?? null);
    if (previousFingerprint !== nextFingerprint) {
      changed.push(group);
    }
  }

  return changed;
}

export function buildCanonicalPipelineSnapshot(input: {
  selectedDataSource: string;
  controllerStateRevision: number;
  scraperStateRevision: number;
  canonicalSourceUsed: string;
  localCanonicalRevision: number | null;
  snapshot: CanonicalProjectData | null;
  previousSnapshot: CanonicalProjectData | null;
  triggerReason: string;
  controllerActionType?: string | null;
  scraperObservation?: boolean;
  onlineViewerReconcile?: boolean;
  heartbeatCycle?: boolean;
  publicationRequestedAt?: string | null;
  inactiveSourceStateStaged?: boolean | null;
}): CanonicalPipelineDiagnostics {
  const digestPrefix = digestPrefixForSnapshot(input.snapshot);
  const previousDigestPrefix = digestPrefixForSnapshot(input.previousSnapshot);
  const now = new Date().toISOString();
  const digestChanged = digestPrefix !== previousDigestPrefix && digestPrefix !== null;

  return {
    selectedDataSource: input.selectedDataSource,
    controllerStateRevision: input.controllerStateRevision,
    scraperStateRevision: input.scraperStateRevision,
    canonicalSourceUsed: input.canonicalSourceUsed,
    localCanonicalRevision: input.localCanonicalRevision,
    localCanonicalDigestPrefix: digestPrefix,
    lastControllerChangeAt: input.controllerActionType ? now : null,
    lastControllerActionType: input.controllerActionType ?? null,
    lastScraperChangeAt: input.scraperObservation ? now : null,
    lastCanonicalInputChangedAt:
      input.controllerActionType || input.scraperObservation ? now : null,
    lastCanonicalRegeneratedAt: now,
    lastCanonicalDigestChangedAt: digestChanged ? now : null,
    lastCanonicalPublicationRequestedAt: input.publicationRequestedAt ?? null,
    lastCanonicalPublicationTriggerReason: input.triggerReason,
    lastCanonicalStructuralGroups: fingerprintCanonicalStructuralGroups(input.snapshot),
    lastChangedStructuralGroups: diffCanonicalStructuralGroups(
      input.previousSnapshot,
      input.snapshot,
    ),
    lastHeartbeatCycleAt: input.heartbeatCycle ? now : null,
    lastOnlineViewerReconcileAt: input.onlineViewerReconcile ? now : null,
    inactiveSourceStateStaged: input.inactiveSourceStateStaged ?? null,
    updatedAt: now,
  };
}
