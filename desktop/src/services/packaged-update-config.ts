import fs from "fs";
import path from "path";
import { app } from "electron";
import { getCanonicalReleaseVersion } from "../app/release-version";

export type PackagedUpdateConfigDiagnostics = {
  packaged: boolean;
  currentVersion: string;
  configPath: string;
  fileExists: boolean;
  provider: string | null;
  owner: string | null;
  repo: string | null;
};

function parseSimpleYamlMapping(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf(":");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key) {
      values[key] = value;
    }
  }
  return values;
}

export function getPackagedUpdateConfigPath(): string {
  return path.join(process.resourcesPath, "app-update.yml");
}

export function readPackagedUpdateConfigDiagnostics(): PackagedUpdateConfigDiagnostics {
  const configPath = getPackagedUpdateConfigPath();
  const diagnostics: PackagedUpdateConfigDiagnostics = {
    packaged: app.isPackaged,
    currentVersion: safeCurrentVersion(),
    configPath,
    fileExists: false,
    provider: null,
    owner: null,
    repo: null,
  };

  if (!app.isPackaged) {
    return diagnostics;
  }

  try {
    if (!fs.existsSync(configPath)) {
      return diagnostics;
    }
    diagnostics.fileExists = true;
    const parsed = parseSimpleYamlMapping(fs.readFileSync(configPath, "utf8"));
    diagnostics.provider = parsed.provider ?? null;
    diagnostics.owner = parsed.owner ?? null;
    diagnostics.repo = parsed.repo ?? null;
  } catch {
    return diagnostics;
  }

  return diagnostics;
}

function safeCurrentVersion(): string {
  try {
    return getCanonicalReleaseVersion();
  } catch {
    return app.getVersion();
  }
}

export function formatMissingUpdateConfigMessage(): string {
  return "Update configuration is missing from this installation.";
}

export function logPackagedUpdateConfigDiagnostics(
  logger: (type: string, message: string, metadata?: Record<string, unknown>) => void,
): PackagedUpdateConfigDiagnostics {
  const diagnostics = readPackagedUpdateConfigDiagnostics();
  logger("update.config", "Packaged update configuration inspected.", {
    packaged: diagnostics.packaged,
    currentVersion: diagnostics.currentVersion,
    configPath: diagnostics.configPath,
    fileExists: diagnostics.fileExists,
    provider: diagnostics.provider,
    owner: diagnostics.owner,
    repo: diagnostics.repo,
  });
  return diagnostics;
}
