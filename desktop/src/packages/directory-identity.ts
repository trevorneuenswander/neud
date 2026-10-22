/**
 * Choose the canonical cloud_project_id when two directory identities collide
 * on the same slug. Prefer a real cloud UUID over a builtin: placeholder.
 * When both are real (or both builtin), prefer the incoming id.
 */
export function pickCanonicalDirectoryCloudProjectId(
  existingCloudProjectId: string,
  incomingCloudProjectId: string,
): string {
  const existing = existingCloudProjectId.trim();
  const incoming = incomingCloudProjectId.trim();
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }
  if (existing === incoming) {
    return existing;
  }
  const existingBuiltin = existing.startsWith("builtin:");
  const incomingBuiltin = incoming.startsWith("builtin:");
  if (existingBuiltin && !incomingBuiltin) {
    return incoming;
  }
  if (!existingBuiltin && incomingBuiltin) {
    return existing;
  }
  return incoming;
}
