import {
  shouldUseLocalData,
  shouldUseLocalDataClient,
} from "@/lib/env/neud-env";

/**
 * Desktop runtime: Electron with local SQLite/API as source of truth.
 * Server components and middleware should use this helper.
 */
export function isDesktopRuntime(): boolean {
  return shouldUseLocalData();
}

/**
 * Hosted web runtime: Vercel portal without local data mode.
 */
export function isHostedWebRuntime(): boolean {
  return !shouldUseLocalData();
}

/**
 * Client-side desktop detection via Electron preload bridge or local-data flag.
 */
export function isDesktopRuntimeClient(): boolean {
  return shouldUseLocalDataClient();
}

/**
 * Client-side hosted portal detection.
 */
export function isHostedWebRuntimeClient(): boolean {
  return !shouldUseLocalDataClient();
}
