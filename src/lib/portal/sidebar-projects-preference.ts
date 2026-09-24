const STORAGE_KEY = "neud:sidebar:projects-expanded";

export function readSidebarProjectsExpandedPreference(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeSidebarProjectsExpandedPreference(expanded: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}
