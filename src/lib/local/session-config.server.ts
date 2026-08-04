import "server-only";
import path from "path";

export type LocalApiSessionConfig = {
  baseUrl: string;
  sessionToken: string;
  userId: string;
  updatedAt: string;
};

let cachedSessionConfig: LocalApiSessionConfig | null | undefined;

export function readLocalApiSessionConfig(): LocalApiSessionConfig | null {
  if (cachedSessionConfig !== undefined) {
    return cachedSessionConfig;
  }

  const configPath = resolveSessionConfigPath();
  if (!configPath) {
    cachedSessionConfig = null;
    return null;
  }

  cachedSessionConfig = readSessionConfigFromPath(configPath);
  return cachedSessionConfig;
}

export function getLocalApiSessionTokenFromFile(): string | null {
  return readLocalApiSessionConfig()?.sessionToken ?? null;
}

export function resetLocalApiSessionConfigCache() {
  cachedSessionConfig = undefined;
}

function readSessionConfigFromPath(configPath: string): LocalApiSessionConfig | null {
  try {
    // Lazy-load fs so Turbopack does not trace dynamic AppData paths at build time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<LocalApiSessionConfig>;

    if (
      typeof parsed.baseUrl === "string" &&
      typeof parsed.sessionToken === "string" &&
      parsed.sessionToken.trim()
    ) {
      return {
        baseUrl: parsed.baseUrl.replace(/\/$/, ""),
        sessionToken: parsed.sessionToken.trim(),
        userId: typeof parsed.userId === "string" ? parsed.userId : "",
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    }
  } catch {
    // Missing or invalid session config.
  }

  return null;
}

function resolveSessionConfigPath(): string | null {
  const explicit = process.env.NEUD_LOCAL_SESSION_FILE?.trim();
  if (explicit) {
    return explicit;
  }

  const appDataDir = process.env.NEUD_APP_DATA_DIR?.trim();
  if (appDataDir) {
    return joinAppPath(appDataDir, "config", "local-api-session.json");
  }

  const appDataRoot = process.env.APPDATA;
  if (!appDataRoot) {
    return null;
  }

  const candidates = [
    joinAppPath(appDataRoot, "NEUD", "config", "local-api-session.json"),
    joinAppPath(appDataRoot, "Electron", "config", "local-api-session.json"),
  ];

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return candidates[candidates.length - 1] ?? null;
}

function joinAppPath(...segments: string[]): string {
  return path.join(/* turbopackIgnore: true */ ...segments);
}
