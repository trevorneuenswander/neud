import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { AuthLicenseManager } from "../auth-license-manager";
import type { UserPinnedViewerRepository } from "../../repositories/user-pinned-viewer-repository";
import {
  mergePinnedViewerPreferenceByUpdatedAt,
  normalizePinnedViewerHeight,
} from "../../lib/displays/pinned-viewer-preference";
import {
  fetchCloudPinnedViewerPreference,
  upsertCloudPinnedViewerPreference,
} from "./pinned-viewer-cloud-sync";

export class PinnedViewerSyncService {
  private syncInFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly auth: AuthLicenseManager,
    private readonly repository: UserPinnedViewerRepository,
  ) {}

  requestSync(projectId: string, reason = "manual") {
    const key = projectId;
    if (this.syncInFlight.has(key)) {
      return this.syncInFlight.get(key)!;
    }

    const task = this.runSync(projectId, reason).finally(() => {
      this.syncInFlight.delete(key);
    });
    this.syncInFlight.set(key, task);
    return task;
  }

  async syncAllPending(reason = "pending-batch") {
    const pending = this.repository.listPendingSync(100);
    for (const row of pending) {
      await this.runSync(row.projectId, reason).catch(() => {
        // best-effort batch
      });
    }
  }

  private async runSync(projectId: string, reason: string) {
    const clientResult = await this.cloud.ensureAuthenticatedClient(`pinned-viewer:${reason}`);
    if (!clientResult.clientCreationSucceeded || !clientResult.client) {
      return;
    }

    const client = clientResult.client;
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      return;
    }

    const local = this.repository.get(userId, projectId);
    let remote: Awaited<ReturnType<typeof fetchCloudPinnedViewerPreference>> = null;
    try {
      remote = await fetchCloudPinnedViewerPreference(client, projectId);
    } catch {
      if (local?.cloudSyncStatus === "pending") {
        this.repository.markSyncFailed(userId, projectId);
      }
      return;
    }

    const empty = {
      updatedAt: new Date(0).toISOString(),
      pinnedDisplayIds: [] as string[],
      pinnedStacks: [] as import("../../lib/displays/pinned-viewer-stacks").PinnedStackRecord[],
      viewerHeightPx: 220,
    };

    const merged = mergePinnedViewerPreferenceByUpdatedAt(
      local
        ? {
            updatedAt: local.updatedAt,
            pinnedDisplayIds: local.pinnedDisplayIds,
            pinnedStacks: local.pinnedStacks,
            viewerHeightPx: local.viewerHeightPx,
          }
        : empty,
      remote
        ? {
            updatedAt: remote.updatedAt,
            pinnedDisplayIds: remote.pinnedDisplayIds,
            pinnedStacks: remote.pinnedStacks,
            viewerHeightPx: remote.viewerHeightPx,
          }
        : empty,
    );

    const localWins =
      local &&
      (local.cloudSyncStatus === "pending" || local.cloudSyncStatus === "failed") &&
      Date.parse(local.updatedAt) >= Date.parse(merged.updatedAt);

    if (localWins) {
      try {
        const result = await upsertCloudPinnedViewerPreference(client, {
          userId,
          projectId,
          pinnedDisplayIds: local.pinnedDisplayIds,
          pinnedStacks: local.pinnedStacks,
          viewerHeightPx: local.viewerHeightPx,
          updatedAt: local.updatedAt,
        });
        this.repository.markSynced(userId, projectId, result.updatedAt);
      } catch {
        this.repository.markSyncFailed(userId, projectId);
      }
      return;
    }

    if (!local && !remote) {
      return;
    }

    this.repository.upsert({
      userId,
      projectId,
      pinnedDisplayIds: merged.pinnedDisplayIds,
      pinnedStacks: merged.pinnedStacks ?? [],
      viewerHeightPx: normalizePinnedViewerHeight(merged.viewerHeightPx),
      updatedAt: merged.updatedAt,
      cloudSyncStatus: "synced",
      cloudUpdatedAt: merged.updatedAt,
    });
  }
}
