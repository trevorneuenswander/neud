import path from "path";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function assertSafeResourceId(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed || !SAFE_ID_PATTERN.test(trimmed) || trimmed.includes("..")) {
    throw new Error(`Invalid ${label}.`);
  }
}

export function resolvePathWithinRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Path traversal rejected.");
  }
  return resolved;
}

export function sanitizeDisplaySlug(value: string): string {
  return value.trim().toLowerCase();
}
