/**
 * Prefer the SQLite project id attached to a display record over page-level ids
 * (page ids can lag hosted/cloud reconciliation on fresh installs).
 */
export function resolveDisplayPreviewProjectId(
  pageProjectId: string,
  displayProjectId?: string | null,
): string {
  const fromDisplay = displayProjectId?.trim();
  return fromDisplay || pageProjectId;
}
