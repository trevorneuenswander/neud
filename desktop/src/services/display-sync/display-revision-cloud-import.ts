import fs from "fs";
import path from "path";
import type { ProjectCodeRevisionsRepository, ProjectCodeRevisionRow } from "../../repositories/project-code-revisions-repository";
import type { ProjectCodeStorageService } from "../project-code-storage-service";
import type { CloudDisplayRevisionRow } from "./cloud-display-client";
import { hashDisplayHtml } from "./cloud-display-mapper";

export type RevisionCollisionType =
  | "same_content_different_id"
  | "same_version_different_content"
  | "bundled_v1_hosted_v1_identical"
  | "bundled_v1_hosted_v1_different"
  | "display_id_realignment"
  | "local_ordinal_independent"
  | "published_revision_missing";

export type RevisionImportOutcome =
  | { status: "inserted" }
  | { status: "skipped"; reason: "existing_id" | "identical_hash" }
  | { status: "reconciled"; reason: "identity" | "bundled_v1_identical" | "hash_match" }
  | { status: "conflict_preserved"; localRevisionId: string; reassignedVersion: number }
  | { status: "failed"; message: string };

export type RevisionConflictDiagnostic = {
  displayId: string;
  hostedDisplayId: string;
  slug: string;
  localRevisionId: string | null;
  hostedRevisionId: string;
  localVersionNumber: number | null;
  hostedVersionNumber: number;
  localSourceHash: string | null;
  hostedSourceHash: string;
  localCreatedAt: string | null;
  hostedCreatedAt: string;
  localPublishedRevisionId: string | null;
  hostedPublishedRevisionId: string | null;
  collisionType: RevisionCollisionType;
};

function isLocalBundledRevision(revision: ProjectCodeRevisionRow): boolean {
  if (revision.metadata.cloudSynced === true) {
    return false;
  }
  return (
    revision.metadata.seeded === true ||
    typeof revision.metadata.importKey === "string" ||
    revision.metadata.storageRevisionId === revision.id
  );
}

function resolveHostedSourceHash(revision: CloudDisplayRevisionRow): string {
  return revision.content_hash || hashDisplayHtml(revision.html_content);
}

function allocateFreeVersionNumber(
  revisions: ProjectCodeRevisionsRepository,
  projectId: string,
  displayId: string,
  reserved: Set<number>,
): number {
  let candidate = revisions.getNextDisplayVersionNumber(projectId, displayId);
  while (reserved.has(candidate)) {
    candidate += 1;
  }
  reserved.add(candidate);
  return candidate;
}

export function importCloudDisplayRevision(input: {
  projectId: string;
  displayId: string;
  slug: string;
  hostedPublishedRevisionId: string | null;
  localPublishedRevisionId: string | null;
  revision: CloudDisplayRevisionRow;
  revisions: ProjectCodeRevisionsRepository;
  storage: ProjectCodeStorageService;
  actorUserId: string;
  reservedVersionNumbers: Set<number>;
}): { outcome: RevisionImportOutcome; diagnostic: RevisionConflictDiagnostic | null } {
  const hostedHash = resolveHostedSourceHash(input.revision);
  const baseDiagnostic: RevisionConflictDiagnostic = {
    displayId: input.displayId,
    hostedDisplayId: input.displayId,
    slug: input.slug,
    localRevisionId: null,
    hostedRevisionId: input.revision.id,
    localVersionNumber: null,
    hostedVersionNumber: input.revision.version_number,
    localSourceHash: null,
    hostedSourceHash: hostedHash,
    localCreatedAt: null,
    hostedCreatedAt: input.revision.created_at,
    localPublishedRevisionId: input.localPublishedRevisionId,
    hostedPublishedRevisionId: input.hostedPublishedRevisionId,
    collisionType: "same_version_different_content",
  };

  const existingById = input.revisions.getById(input.revision.id);
  if (existingById) {
    return {
      outcome: { status: "skipped", reason: "existing_id" },
      diagnostic: null,
    };
  }

  const existingByHash = input.revisions.findByResourceAndSourceHash({
    projectId: input.projectId,
    resourceType: "display",
    resourceId: input.displayId,
    sourceHash: hostedHash,
  });
  if (existingByHash && existingByHash.id !== input.revision.id) {
    const diagnostic: RevisionConflictDiagnostic = {
      ...baseDiagnostic,
      localRevisionId: existingByHash.id,
      localVersionNumber: existingByHash.versionNumber,
      localSourceHash: existingByHash.sourceHash,
      localCreatedAt: existingByHash.createdAt,
      collisionType: "same_content_different_id",
    };
    const reconciled = input.revisions.reconcileRevisionIdentity({
      fromRevisionId: existingByHash.id,
      toRevisionId: input.revision.id,
      displayId: input.displayId,
      versionNumber: input.revision.version_number,
      onStorageRelocate: (fromId, toId) => {
        relocateRevisionStorage(input.storage, input.projectId, input.displayId, fromId, toId);
      },
    });
    if (!reconciled) {
      return {
        outcome: { status: "failed", message: "hash_match_reconciliation_failed" },
        diagnostic,
      };
    }
    return {
      outcome: { status: "reconciled", reason: "hash_match" },
      diagnostic,
    };
  }

  const existingByVersion = input.revisions.findByResourceAndVersionNumber({
    projectId: input.projectId,
    resourceType: "display",
    resourceId: input.displayId,
    versionNumber: input.revision.version_number,
  });

  if (existingByVersion && existingByVersion.id !== input.revision.id) {
    const diagnostic: RevisionConflictDiagnostic = {
      ...baseDiagnostic,
      localRevisionId: existingByVersion.id,
      localVersionNumber: existingByVersion.versionNumber,
      localSourceHash: existingByVersion.sourceHash,
      localCreatedAt: existingByVersion.createdAt,
      collisionType:
        existingByVersion.versionNumber === 1 &&
        input.revision.version_number === 1 &&
        isLocalBundledRevision(existingByVersion)
          ? existingByVersion.sourceHash === hostedHash
            ? "bundled_v1_hosted_v1_identical"
            : "bundled_v1_hosted_v1_different"
          : "same_version_different_content",
    };

    if (existingByVersion.sourceHash === hostedHash) {
      const reconciled = input.revisions.reconcileRevisionIdentity({
        fromRevisionId: existingByVersion.id,
        toRevisionId: input.revision.id,
        displayId: input.displayId,
        versionNumber: input.revision.version_number,
        onStorageRelocate: (fromId, toId) => {
          relocateRevisionStorage(input.storage, input.projectId, input.displayId, fromId, toId);
        },
      });
      if (!reconciled) {
        return {
          outcome: { status: "failed", message: "version_collision_reconciliation_failed" },
          diagnostic,
        };
      }
      return {
        outcome: {
          status: "reconciled",
          reason:
            diagnostic.collisionType === "bundled_v1_hosted_v1_identical"
              ? "bundled_v1_identical"
              : "identity",
        },
        diagnostic,
      };
    }

    const reassignedVersion = allocateFreeVersionNumber(
      input.revisions,
      input.projectId,
      input.displayId,
      input.reservedVersionNumbers,
    );
    const reassigned = input.revisions.reassignVersionNumber(
      existingByVersion.id,
      reassignedVersion,
    );
    if (!reassigned) {
      return {
        outcome: { status: "failed", message: "version_reassignment_failed" },
        diagnostic,
      };
    }

    input.revisions.insertCloudRevision({
      id: input.revision.id,
      projectId: input.projectId,
      resourceType: "display",
      resourceId: input.displayId,
      revisionName: input.revision.version_note ?? `v${input.revision.version_number}`,
      changeNote: input.revision.version_note,
      message: `Downloaded revision v${input.revision.version_number}`,
      sourceHash: hostedHash,
      validationStatus: "valid",
      createdBy: input.revision.created_by_user_id ?? input.actorUserId,
      versionNumber: input.revision.version_number,
      createdAt: input.revision.created_at,
      metadata: { cloudSynced: true, sourceInstanceId: input.revision.source_instance_id },
    });

    writeRevisionStorage(input.storage, input.projectId, input.displayId, input.revision);

    return {
      outcome: {
        status: "conflict_preserved",
        localRevisionId: existingByVersion.id,
        reassignedVersion,
      },
      diagnostic,
    };
  }

  input.revisions.insertCloudRevision({
    id: input.revision.id,
    projectId: input.projectId,
    resourceType: "display",
    resourceId: input.displayId,
    revisionName: input.revision.version_note ?? `v${input.revision.version_number}`,
    changeNote: input.revision.version_note,
    message: `Downloaded revision v${input.revision.version_number}`,
    sourceHash: hostedHash,
    validationStatus: "valid",
    createdBy: input.revision.created_by_user_id ?? input.actorUserId,
    versionNumber: input.revision.version_number,
    createdAt: input.revision.created_at,
    metadata: { cloudSynced: true, sourceInstanceId: input.revision.source_instance_id },
  });

  writeRevisionStorage(input.storage, input.projectId, input.displayId, input.revision);

  input.reservedVersionNumbers.add(input.revision.version_number);
  return { outcome: { status: "inserted" }, diagnostic: null };
}

function writeRevisionStorage(
  storage: ProjectCodeStorageService,
  projectId: string,
  displayId: string,
  revision: CloudDisplayRevisionRow,
): void {
  storage.writeDisplayRevision(projectId, displayId, revision.id, {
    html: revision.html_content,
    css: "",
    javascript: "",
    metadata: {
      revisionId: revision.id,
      revisionName: revision.version_note ?? `v${revision.version_number}`,
      changeNote: revision.version_note ?? "Synced from cloud.",
      cloudSynced: true,
    },
  });
}

function relocateRevisionStorage(
  storage: ProjectCodeStorageService,
  projectId: string,
  displayId: string,
  fromRevisionId: string,
  toRevisionId: string,
): void {
  if (fromRevisionId === toRevisionId) {
    return;
  }
  const fromDir = storage.getDisplayRevisionDir(projectId, displayId, fromRevisionId);
  const toDir = storage.getDisplayRevisionDir(projectId, displayId, toRevisionId);
  if (!fs.existsSync(fromDir)) {
    return;
  }
  if (!fs.existsSync(toDir)) {
    fs.mkdirSync(path.dirname(toDir), { recursive: true });
    fs.cpSync(fromDir, toDir, { recursive: true });
  }
  fs.rmSync(fromDir, { recursive: true, force: true });
}

export function formatRevisionConflictDiagnostic(
  diagnostic: RevisionConflictDiagnostic,
): string {
  return [
    "pull.conflict.detail",
    `displayId=${diagnostic.displayId}`,
    `hostedDisplayId=${diagnostic.hostedDisplayId}`,
    `slug=${diagnostic.slug}`,
    `localRevisionId=${diagnostic.localRevisionId ?? "none"}`,
    `hostedRevisionId=${diagnostic.hostedRevisionId}`,
    `localVersion=${diagnostic.localVersionNumber ?? "none"}`,
    `hostedVersion=${diagnostic.hostedVersionNumber}`,
    `localHash=${diagnostic.localSourceHash ?? "none"}`,
    `hostedHash=${diagnostic.hostedSourceHash}`,
    `localCreatedAt=${diagnostic.localCreatedAt ?? "none"}`,
    `hostedCreatedAt=${diagnostic.hostedCreatedAt}`,
    `localPublishedRevisionId=${diagnostic.localPublishedRevisionId ?? "none"}`,
    `hostedPublishedRevisionId=${diagnostic.hostedPublishedRevisionId ?? "none"}`,
    `collisionType=${diagnostic.collisionType}`,
  ].join(" ");
}
