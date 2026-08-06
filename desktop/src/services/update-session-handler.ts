import type { AppPaths } from "./app-paths";
import {
  consumePendingInstalledUpdateMarker,
  clearPendingInstalledUpdateMarker,
  isPendingInstalledUpdateMarkerStale,
  readPendingInstalledUpdateMarker,
  releaseVersionsEqual,
} from "./pending-installed-update";
import { appendUpdateSessionLog } from "./update-session-log";

export type PendingInstalledUpdateEvaluation = {
  logoutRequired: boolean;
  showPostUpdateSignInMessage: boolean;
  markerFound: boolean;
  sourceVersion: string | null;
  targetVersion: string | null;
  installedVersion: string;
  versionChanged: boolean;
  markerConsumed: boolean;
  reason: string | null;
  operationId: string | null;
};

export function evaluatePendingInstalledUpdateOnStartup(
  paths: AppPaths,
  installedVersion: string,
): PendingInstalledUpdateEvaluation {
  const marker = readPendingInstalledUpdateMarker(paths);
  const normalizedInstalled = installedVersion.trim();

  if (!marker) {
    appendUpdateSessionLog(paths, {
      event: "startup.no_marker",
      markerFound: false,
      installedVersion: normalizedInstalled,
      versionChanged: false,
      logoutPerformed: false,
      markerConsumed: false,
    });

    return {
      logoutRequired: false,
      showPostUpdateSignInMessage: false,
      markerFound: false,
      sourceVersion: null,
      targetVersion: null,
      installedVersion: normalizedInstalled,
      versionChanged: false,
      markerConsumed: false,
      reason: null,
      operationId: null,
    };
  }

  const versionChanged = !releaseVersionsEqual(
    normalizedInstalled,
    marker.sourceVersion,
  );
  const matchesTarget = releaseVersionsEqual(
    normalizedInstalled,
    marker.targetVersion,
  );
  const stillOnSource = releaseVersionsEqual(
    normalizedInstalled,
    marker.sourceVersion,
  );

  if (matchesTarget && versionChanged) {
    const markerConsumed = consumePendingInstalledUpdateMarker(paths);
    appendUpdateSessionLog(paths, {
      event: "startup.update_installed",
      markerFound: true,
      sourceVersion: marker.sourceVersion,
      targetVersion: marker.targetVersion,
      installedVersion: normalizedInstalled,
      versionChanged: true,
      logoutPerformed: true,
      markerConsumed,
      operationId: marker.operationId,
    });

    return {
      logoutRequired: true,
      showPostUpdateSignInMessage: true,
      markerFound: true,
      sourceVersion: marker.sourceVersion,
      targetVersion: marker.targetVersion,
      installedVersion: normalizedInstalled,
      versionChanged: true,
      markerConsumed,
      reason: "installed_version_matches_target",
      operationId: marker.operationId,
    };
  }

  if (stillOnSource) {
    if (isPendingInstalledUpdateMarkerStale(marker)) {
      clearPendingInstalledUpdateMarker(paths);
      appendUpdateSessionLog(paths, {
        event: "startup.stale_marker_cleared",
        markerFound: true,
        sourceVersion: marker.sourceVersion,
        targetVersion: marker.targetVersion,
        installedVersion: normalizedInstalled,
        versionChanged: false,
        logoutPerformed: false,
        markerConsumed: true,
        reason: "installation_did_not_occur_before_stale_timeout",
        operationId: marker.operationId,
      });

      return {
        logoutRequired: false,
        showPostUpdateSignInMessage: false,
        markerFound: true,
        sourceVersion: marker.sourceVersion,
        targetVersion: marker.targetVersion,
        installedVersion: normalizedInstalled,
        versionChanged: false,
        markerConsumed: true,
        reason: "installation_did_not_occur_before_stale_timeout",
        operationId: marker.operationId,
      };
    }

    appendUpdateSessionLog(paths, {
      event: "startup.install_pending",
      markerFound: true,
      sourceVersion: marker.sourceVersion,
      targetVersion: marker.targetVersion,
      installedVersion: normalizedInstalled,
      versionChanged: false,
      logoutPerformed: false,
      markerConsumed: false,
      reason: "installed_version_unchanged",
      operationId: marker.operationId,
    });

    return {
      logoutRequired: false,
      showPostUpdateSignInMessage: false,
      markerFound: true,
      sourceVersion: marker.sourceVersion,
      targetVersion: marker.targetVersion,
      installedVersion: normalizedInstalled,
      versionChanged: false,
      markerConsumed: false,
      reason: "installed_version_unchanged",
      operationId: marker.operationId,
    };
  }

  clearPendingInstalledUpdateMarker(paths);
  appendUpdateSessionLog(paths, {
    event: "startup.unexpected_version_cleared",
    markerFound: true,
    sourceVersion: marker.sourceVersion,
    targetVersion: marker.targetVersion,
    installedVersion: normalizedInstalled,
    versionChanged,
    logoutPerformed: false,
    markerConsumed: true,
    reason: "installed_version_does_not_match_marker",
    operationId: marker.operationId,
  });

  return {
    logoutRequired: false,
    showPostUpdateSignInMessage: false,
    markerFound: true,
    sourceVersion: marker.sourceVersion,
    targetVersion: marker.targetVersion,
    installedVersion: normalizedInstalled,
    versionChanged,
    markerConsumed: true,
    reason: "installed_version_does_not_match_marker",
    operationId: marker.operationId,
  };
}
