import type { ProjectCodeRevisionsRepository } from "../../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../../repositories/project-display-code-repository";
import type { ProjectCodeStorageService } from "../project-code-storage-service";
import type { DisplayFileBundle } from "../project-code-storage-service";
import { reconcilePublishedDisplayContent } from "../../lib/reconcile-published-display-content";
import type { CloudDisplayRevisionRow } from "./cloud-display-client";
import {
  cloudRevisionHtmlVerified,
  importCloudDisplayRevision,
} from "./display-revision-cloud-import";
import { BROAD_ARROW_STREAM_DISPLAY_SPECS } from "../../displays/broad-arrow-stream-display-specs";
import { hashBundledDisplayContentIdentity } from "../../displays/display-source-content-hash";

export type PublishedRevisionRecoveryStatus =
  | "already_materialized"
  | "cloud_revision_restored"
  | "orphaned_revision_restored"
  | "bundled_identity_restored"
  | "published_pointer_missing"
  | "published_revision_metadata_missing"
  | "published_revision_content_missing"
  | "published_content_hydration_failed"
  | "published_content_hydrated";

export type PublishedRevisionRecoveryResult = {
  status: PublishedRevisionRecoveryStatus;
  publishedRevisionId: string | null;
};

export function buildProvenBundledRevisionBundle(input: {
  slug: string;
  revisionId: string;
  importKey: string | null;
  sourceHash: string | null;
  bundledHtml: string;
  runtimeHtml: string;
}): DisplayFileBundle | null {
  const spec = BROAD_ARROW_STREAM_DISPLAY_SPECS.find((entry) => entry.slug === input.slug);
  if (!spec || !input.importKey || input.importKey !== spec.importKey) {
    return null;
  }
  if (!input.sourceHash || !input.bundledHtml.trim() || !input.runtimeHtml.trim()) {
    return null;
  }
  const expected = hashBundledDisplayContentIdentity({
    importKey: spec.importKey,
    bundledHtml: input.bundledHtml,
  });
  if (input.sourceHash !== expected) {
    return null;
  }
  return {
    html: input.runtimeHtml,
    css: "",
    javascript: "",
    metadata: {
      revisionId: input.revisionId,
      importKey: spec.importKey,
      restoredFromBundledIdentity: true,
      bundledSourceHash: expected,
    },
  };
}

function isBundledSeedRevision(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) {
    return false;
  }
  if (metadata.seeded === true) {
    return true;
  }
  return typeof metadata.importKey === "string" && metadata.importKey.trim().length > 0;
}

function readBundle(
  storage: ProjectCodeStorageService,
  projectId: string,
  displayId: string,
  revisionId: string | null,
): DisplayFileBundle | null {
  if (!revisionId) {
    return null;
  }
  const bundle = storage.readDisplayRevision(projectId, displayId, revisionId);
  return bundle?.html?.trim() ? bundle : null;
}

export async function recoverFreshInstallPublishedRevision(input: {
  projectId: string;
  displayId: string;
  slug: string;
  localPublishedRevisionId: string | null;
  cloudPublishedRevisionId: string | null;
  knownCloudRevision: CloudDisplayRevisionRow | null;
  fetchRevisionById: (revisionId: string) => Promise<CloudDisplayRevisionRow | null>;
  revisions: ProjectCodeRevisionsRepository;
  displayCode: ProjectDisplayCodeRepository;
  storage: ProjectCodeStorageService;
  actorUserId: string;
  pendingLocalActiveRevisionPush: boolean;
  localDisplaySyncPending: boolean;
  restoreProvenBundledRevision?: (revisionId: string) => DisplayFileBundle | null;
}): Promise<PublishedRevisionRecoveryResult> {
  const localPointer = input.localPublishedRevisionId?.trim() || null;
  const cloudPointer = input.cloudPublishedRevisionId?.trim() || null;
  if (!localPointer && !cloudPointer) {
    return { status: "published_pointer_missing", publishedRevisionId: null };
  }

  let cloudRevision = input.knownCloudRevision;
  if (cloudPointer && cloudRevision?.id !== cloudPointer) {
    cloudRevision = await input.fetchRevisionById(cloudPointer);
  }
  const cloudVerified = Boolean(cloudRevision && cloudRevisionHtmlVerified(cloudRevision));
  const localRevision = localPointer ? input.revisions.getById(localPointer) : null;
  const localBundle = readBundle(input.storage, input.projectId, input.displayId, localPointer);
  const localIsSeed = isBundledSeedRevision(localRevision?.metadata);
  const pendingUserEdit =
    (input.pendingLocalActiveRevisionPush || input.localDisplaySyncPending) &&
    Boolean(localBundle) &&
    !localIsSeed &&
    Boolean(localPointer) &&
    localPointer !== cloudPointer;

  let targetRevisionId = localPointer;
  let adoptedCloud = false;
  if (
    cloudVerified &&
    cloudRevision &&
    cloudPointer &&
    !pendingUserEdit &&
    (!localBundle || localIsSeed || localPointer === cloudPointer || !localPointer)
  ) {
    const imported = importCloudDisplayRevision({
      projectId: input.projectId,
      displayId: input.displayId,
      slug: input.slug,
      hostedPublishedRevisionId: cloudPointer,
      localPublishedRevisionId: localPointer,
      revision: cloudRevision,
      revisions: input.revisions,
      storage: input.storage,
      actorUserId: input.actorUserId,
      reservedVersionNumbers: new Set<number>(),
    });
    if (imported.outcome.status === "failed") {
      return {
        status: "published_content_hydration_failed",
        publishedRevisionId: localPointer ?? cloudPointer,
      };
    }
    if (!readBundle(input.storage, input.projectId, input.displayId, cloudPointer)) {
      return {
        status: "published_content_hydration_failed",
        publishedRevisionId: cloudPointer,
      };
    }
    if (localPointer !== cloudPointer) {
      const code = input.displayCode.getByDisplayId(input.displayId);
      if (code) {
        input.displayCode.upsert({
          displayId: input.displayId,
          projectId: input.projectId,
          slug: code.slug,
          publishedRevisionId: cloudPointer,
          updatedBy: input.actorUserId,
        });
      }
    }
    targetRevisionId = cloudPointer;
    adoptedCloud = localPointer !== cloudPointer || !localBundle;
  }

  const activePointer =
    input.displayCode.getByDisplayId(input.displayId)?.publishedRevisionId ?? targetRevisionId;
  if (!activePointer) {
    return { status: "published_pointer_missing", publishedRevisionId: null };
  }

  if (!input.revisions.getById(activePointer) && !readBundle(input.storage, input.projectId, input.displayId, activePointer)) {
    return {
      status: "published_revision_metadata_missing",
      publishedRevisionId: activePointer,
    };
  }

  let recoveredFrom: "cloud" | "orphan" | "bundled" | "existing" = adoptedCloud
    ? "cloud"
    : "existing";

  if (!readBundle(input.storage, input.projectId, input.displayId, activePointer)) {
    const orphan = input.storage.findDisplayRevisionBundle(activePointer);
    if (orphan?.html?.trim()) {
      input.storage.writeDisplayRevision(input.projectId, input.displayId, activePointer, orphan);
      recoveredFrom = "orphan";
    }
  }

  if (!readBundle(input.storage, input.projectId, input.displayId, activePointer)) {
    const restored = input.restoreProvenBundledRevision?.(activePointer) ?? null;
    if (restored?.html?.trim()) {
      input.storage.writeDisplayRevision(
        input.projectId,
        input.displayId,
        activePointer,
        restored,
      );
      recoveredFrom = "bundled";
    }
  }

  if (!readBundle(input.storage, input.projectId, input.displayId, activePointer)) {
    if (!input.revisions.getById(activePointer)) {
      return {
        status: "published_revision_metadata_missing",
        publishedRevisionId: activePointer,
      };
    }
    return {
      status: "published_revision_content_missing",
      publishedRevisionId: activePointer,
    };
  }

  const hydrated = reconcilePublishedDisplayContent({
    projectId: input.projectId,
    displayId: input.displayId,
    publishedRevisionId: activePointer,
    storage: input.storage,
    resolveStorageRevisionId: (revisionId) => {
      const revision = input.revisions.getById(revisionId);
      const storageRevisionId = revision?.metadata?.storageRevisionId;
      if (typeof storageRevisionId === "string" && storageRevisionId.trim()) {
        return storageRevisionId.trim();
      }
      return revisionId;
    },
  });

  if (hydrated.status === "missing_revision_bundle") {
    return {
      status: "published_content_hydration_failed",
      publishedRevisionId: activePointer,
    };
  }
  if (hydrated.status === "already_materialized" && recoveredFrom === "existing") {
    return { status: "already_materialized", publishedRevisionId: activePointer };
  }
  if (recoveredFrom === "cloud") {
    return { status: "cloud_revision_restored", publishedRevisionId: activePointer };
  }
  if (recoveredFrom === "orphan") {
    return { status: "orphaned_revision_restored", publishedRevisionId: activePointer };
  }
  if (recoveredFrom === "bundled") {
    return { status: "bundled_identity_restored", publishedRevisionId: activePointer };
  }
  return { status: "published_content_hydrated", publishedRevisionId: activePointer };
}
