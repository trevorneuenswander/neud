import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";

export function getEngineCookiesFile(
  paths: AppPaths,
  engineId: string,
): string {
  return path.join(paths.cookies, `${engineId}.json`);
}

export function hasPersistedSessionCookies(
  paths: AppPaths,
  engineId: string,
): boolean {
  const file = getEngineCookiesFile(paths, engineId);
  if (!fs.existsSync(file)) {
    return false;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
