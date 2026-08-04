const SESSION_SELECTED_LOT_PREFIX = "neud:local-controller:selected-lot";

function sessionSelectedLotStorageKey(userId: string, projectId: string): string {
  return `${SESSION_SELECTED_LOT_PREFIX}:${userId}:${projectId}`;
}

export function readSessionSelectedLotKey(
  userId: string | null | undefined,
  projectId: string,
): string | null {
  if (!userId || typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(sessionSelectedLotStorageKey(userId, projectId));
    const trimmed = raw?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function writeSessionSelectedLotKey(
  userId: string | null | undefined,
  projectId: string,
  selectedLotKey: string,
): void {
  if (!userId || typeof window === "undefined") {
    return;
  }

  const normalizedKey = selectedLotKey.trim();
  if (!normalizedKey) {
    return;
  }

  try {
    sessionStorage.setItem(
      sessionSelectedLotStorageKey(userId, projectId),
      normalizedKey,
    );
  } catch {
    // Keep navigation usable even if session storage is unavailable.
  }
}
