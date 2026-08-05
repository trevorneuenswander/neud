import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { isPackagedDesktopRuntime } from "./packaged-runtime";

export const SHARED_RUNTIME_BROWSER_SCRIPT_NAMES = [
  "normalize-display-snapshot.js",
  "display-runtime-publisher.js",
  "hosted-bridge-inbound.js",
] as const;

export type SharedRuntimeBrowserScriptName =
  (typeof SHARED_RUNTIME_BROWSER_SCRIPT_NAMES)[number];

const PACKAGED_RUNTIME_ASSETS_ROOT = "runtime-assets";

function assertSafeAssetName(name: string): void {
  if (
    !name ||
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new Error(`Invalid runtime asset name: ${name}`);
  }
}

function developmentSharedRuntimeBrowserDir(): string {
  return path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "shared",
    "display-runtime",
    "browser",
  );
}

export function resolveDesktopRuntimeAssetPath(relativeAssetPath: string): string {
  const normalized = relativeAssetPath.replace(/\\/g, "/");
  if (!normalized || normalized.includes("..")) {
    throw new Error(`Runtime asset path traversal is not allowed: ${relativeAssetPath}`);
  }

  const segments = normalized.split("/").filter(Boolean);
  for (const segment of segments) {
    assertSafeAssetName(segment);
  }

  if (isPackagedDesktopRuntime()) {
    return path.join(process.resourcesPath, PACKAGED_RUNTIME_ASSETS_ROOT, ...segments);
  }

  if (segments[0] === "display" && segments.length === 2) {
    return path.join(developmentSharedRuntimeBrowserDir(), segments[1] ?? "");
  }

  throw new Error(`Unsupported development runtime asset path: ${relativeAssetPath}`);
}

export function resolveSharedRuntimeBrowserScriptPath(
  scriptName: string,
): string {
  assertSafeAssetName(scriptName);

  if (
    !SHARED_RUNTIME_BROWSER_SCRIPT_NAMES.includes(
      scriptName as SharedRuntimeBrowserScriptName,
    )
  ) {
    throw new Error(
      `Unknown shared runtime browser script "${scriptName}". Allowed: ${SHARED_RUNTIME_BROWSER_SCRIPT_NAMES.join(", ")}`,
    );
  }

  return resolveDesktopRuntimeAssetPath(path.posix.join("display", scriptName));
}

function createMissingRuntimeAssetError(input: {
  asset: string;
  resolvedPath: string;
  category: string;
}): Error {
  return new Error(
    [
      `Missing NEUD runtime asset (${input.category}).`,
      `Asset: ${input.asset}`,
      `Resolved path: ${input.resolvedPath}`,
      `Packaged: ${String(isPackagedDesktopRuntime())}`,
      `app.isPackaged: ${String(app.isPackaged)}`,
      `Version: ${app.getVersion()}`,
    ].join("\n"),
  );
}

export function readSharedRuntimeBrowserScript(scriptName: string): string {
  const resolvedPath = resolveSharedRuntimeBrowserScriptPath(scriptName);
  if (!fs.existsSync(resolvedPath)) {
    throw createMissingRuntimeAssetError({
      asset: scriptName,
      resolvedPath,
      category: "shared-runtime-browser-script",
    });
  }

  const contents = fs.readFileSync(resolvedPath, "utf8");
  if (!contents.trim()) {
    throw createMissingRuntimeAssetError({
      asset: scriptName,
      resolvedPath,
      category: "empty-shared-runtime-browser-script",
    });
  }

  return contents;
}

export function validateDesktopRuntimeAssets(): void {
  const missing: string[] = [];

  for (const scriptName of SHARED_RUNTIME_BROWSER_SCRIPT_NAMES) {
    const resolvedPath = resolveSharedRuntimeBrowserScriptPath(scriptName);
    if (!fs.existsSync(resolvedPath)) {
      missing.push(`${scriptName} -> ${resolvedPath}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Missing required desktop runtime assets:",
        ...missing.map((entry) => `  - ${entry}`),
        `Packaged: ${String(isPackagedDesktopRuntime())}`,
        `resourcesPath: ${process.resourcesPath}`,
      ].join("\n"),
    );
  }
}
