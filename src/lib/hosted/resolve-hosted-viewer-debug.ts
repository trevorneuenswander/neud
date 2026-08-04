/** Whether the hosted viewer should show diagnostics UI (never exposes payload values). */

export function isHostedViewerDebugQueryEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get("neudDebug") === "1";
  } catch {
    return false;
  }
}

export function resolveHostedViewerDebugEnabled(search?: string | null): boolean {
  if (search && isHostedViewerDebugQueryEnabled(search)) {
    return true;
  }
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return process.env.NEXT_PUBLIC_NEUD_DEBUG_VIEWER === "true";
}
