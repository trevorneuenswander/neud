/** Packaged desktop displays should read live data from the local API directly (same as SSE). */
export function resolveDesktopDisplayDataUrl(
  dataUrl: string,
  localApiBase: string,
): string {
  const trimmed = dataUrl?.trim() ?? "";
  if (!trimmed) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const base = localApiBase.replace(/\/$/, "");
  const pathPart = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${pathPart}`;
}
