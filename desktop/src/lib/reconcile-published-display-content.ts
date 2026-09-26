import type { DisplayFileBundle } from "../services/project-code-storage-service";

export type PublishedDisplayStorage = {
  readDisplayPublished(
    projectId: string,
    displayId: string,
  ): DisplayFileBundle | null;
  readDisplayRevision(
    projectId: string,
    displayId: string,
    revisionId: string,
  ): DisplayFileBundle | null;
  writeDisplayPublished(
    projectId: string,
    displayId: string,
    bundle: DisplayFileBundle,
  ): void;
};

export type ReconcilePublishedDisplayContentResult =
  | { status: "skipped_no_pointer" }
  | { status: "already_materialized" }
  | { status: "repaired" }
  | { status: "missing_revision_bundle" };

export function resolveRevisionStorageIdFromMetadata(metadata: Record<string, unknown>): string | null {
  const storageRevisionId = metadata.storageRevisionId;
  if (typeof storageRevisionId === "string" && storageRevisionId.trim()) {
    return storageRevisionId.trim();
  }
  return null;
}

function publishedBundleMatchesPointer(
  published: DisplayFileBundle | null,
  publishedRevisionId: string,
): boolean {
  if (!published?.html?.trim()) {
    return false;
  }
  const metadata = published.metadata ?? {};
  const revisionId =
    typeof metadata.revisionId === "string" && metadata.revisionId.trim()
      ? metadata.revisionId.trim()
      : null;
  if (!revisionId) {
    return true;
  }
  return revisionId === publishedRevisionId;
}

function readRevisionBundleForPointer(
  storage: PublishedDisplayStorage,
  projectId: string,
  displayId: string,
  publishedRevisionId: string,
  resolveStorageRevisionId?: (publishedRevisionId: string) => string | null,
): DisplayFileBundle | null {
  const candidates: string[] = [];
  const resolved = resolveStorageRevisionId?.(publishedRevisionId);
  if (resolved?.trim()) {
    candidates.push(resolved.trim());
  }
  if (!candidates.includes(publishedRevisionId)) {
    candidates.push(publishedRevisionId);
  }

  for (const revisionId of candidates) {
    const bundle = storage.readDisplayRevision(projectId, displayId, revisionId);
    if (bundle?.html?.trim()) {
      return bundle;
    }
  }
  return null;
}

export function reconcilePublishedDisplayContent(input: {
  projectId: string;
  displayId: string;
  publishedRevisionId: string | null;
  storage: PublishedDisplayStorage;
  resolveStorageRevisionId?: (publishedRevisionId: string) => string | null;
  now?: () => string;
}): ReconcilePublishedDisplayContentResult {
  const publishedRevisionId = input.publishedRevisionId?.trim() || null;
  if (!publishedRevisionId) {
    return { status: "skipped_no_pointer" };
  }

  const published = input.storage.readDisplayPublished(input.projectId, input.displayId);
  if (publishedBundleMatchesPointer(published, publishedRevisionId)) {
    return { status: "already_materialized" };
  }

  const revisionBundle = readRevisionBundleForPointer(
    input.storage,
    input.projectId,
    input.displayId,
    publishedRevisionId,
    input.resolveStorageRevisionId,
  );
  if (!revisionBundle) {
    return { status: "missing_revision_bundle" };
  }

  const hydratedAt = input.now?.() ?? new Date().toISOString();
  input.storage.writeDisplayPublished(input.projectId, input.displayId, {
    ...revisionBundle,
    metadata: {
      ...(revisionBundle.metadata ?? {}),
      revisionId: publishedRevisionId,
      hydratedFromRevision: true,
      hydratedAt,
    },
  });

  return { status: "repaired" };
}

export function readPublishedDisplayBundleForOutput(input: {
  projectId: string;
  displayId: string;
  publishedRevisionId: string | null;
  storage: PublishedDisplayStorage;
  resolveStorageRevisionId?: (publishedRevisionId: string) => string | null;
}): DisplayFileBundle | null {
  const publishedRevisionId = input.publishedRevisionId?.trim() || null;

  const published = input.storage.readDisplayPublished(input.projectId, input.displayId);
  if (published?.html?.trim()) {
    if (!publishedRevisionId || publishedBundleMatchesPointer(published, publishedRevisionId)) {
      return published;
    }
  }

  if (!publishedRevisionId) {
    return null;
  }

  reconcilePublishedDisplayContent({
    projectId: input.projectId,
    displayId: input.displayId,
    publishedRevisionId,
    storage: input.storage,
    resolveStorageRevisionId: input.resolveStorageRevisionId,
  });

  const repaired = input.storage.readDisplayPublished(input.projectId, input.displayId);
  if (publishedBundleMatchesPointer(repaired, publishedRevisionId)) {
    return repaired;
  }

  return readRevisionBundleForPointer(
    input.storage,
    input.projectId,
    input.displayId,
    publishedRevisionId,
    input.resolveStorageRevisionId,
  );
}
