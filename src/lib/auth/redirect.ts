const DEFAULT_REDIRECT = "/dashboard";

export function getSafeRedirectPath(
  path: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  if (!path) {
    return fallback;
  }

  const trimmed = path.trim();

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("://") ||
    trimmed.includes("\\")
  ) {
    return fallback;
  }

  return trimmed;
}
