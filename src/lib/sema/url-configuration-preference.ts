/**
 * Presentation-only preference for the SEMA Data Source URL Configuration disclosure.
 * Scoped per project; never written into schedule/canonical data.
 */

const STORAGE_PREFIX = "neud:sema:url-configuration-open:";

export function semaUrlConfigurationStorageKey(projectSlug: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(projectSlug)}`;
}

export function readSemaUrlConfigurationOpen(
  projectSlug: string,
): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(semaUrlConfigurationStorageKey(projectSlug));
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeSemaUrlConfigurationOpen(
  projectSlug: string,
  open: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      semaUrlConfigurationStorageKey(projectSlug),
      open ? "1" : "0",
    );
  } catch {
    // Ignore quota / private-mode failures; preference is non-critical.
  }
}
