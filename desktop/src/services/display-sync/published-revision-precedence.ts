/**
 * Which published revision stays active when local import and cloud sync disagree.
 * These functions do not create revisions.
 */

export function shouldRetainNewerLocalPublishedRevision(
  localVersion: number | null,
  remoteVersion: number | null,
): boolean {
  return localVersion != null && remoteVersion != null && localVersion > remoteVersion;
}

export function choosePushedActiveRevisionId(input: {
  localRevisionId: string | null;
  remoteRevisionId: string | null;
  localReady: boolean;
  localIsSeed: boolean;
  localVersion: number | null;
  remoteVersion: number | null;
}): string | null {
  const localRevisionId = input.localRevisionId;
  const remoteRevisionId = input.remoteRevisionId;
  if (!localRevisionId) {
    return remoteRevisionId;
  }
  if (!input.localReady) {
    return remoteRevisionId;
  }
  if (!remoteRevisionId || remoteRevisionId === localRevisionId) {
    return localRevisionId;
  }
  if (input.localIsSeed) {
    if (
      shouldRetainNewerLocalPublishedRevision(input.localVersion, input.remoteVersion)
    ) {
      return localRevisionId;
    }
    return remoteRevisionId;
  }
  return localRevisionId;
}
