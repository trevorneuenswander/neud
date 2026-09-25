import os from "node:os";
import path from "node:path";

/** Fallback when Electron `app` is not ready (bootstrap logging only). */
export function resolveFallbackNeudUserDataRoot(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "NEUD");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "NEUD");
  }

  return path.join(os.homedir(), ".config", "NEUD");
}
