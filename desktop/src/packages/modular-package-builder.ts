import fs from "fs";
import path from "path";
import {
  capabilityModulesForPackage,
  type ProjectCapabilityId,
} from "../projects/project-capabilities";
import {
  PROJECT_PACKAGE_MANIFEST_KIND,
  PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "./types";
import {
  buildManifestFileMap,
  hashManifestCanonical,
} from "./manifest";
import { readBundledDisplaySource } from "../lib/bundled-display-sources";

export const LIVE_CHAT_OVERLAY_HTML_PATH = "displays/live-chat-overlay-v1.html";
export const LIVE_CHAT_OVERLAY_BUNDLED_FILE = "live-chat-overlay-v1.html";
export const LIVE_CHAT_OVERLAY_SLUG = "live-chat-overlay";

function loadLiveChatOverlayHtml(): string {
  try {
    return readBundledDisplaySource(LIVE_CHAT_OVERLAY_BUNDLED_FILE);
  } catch (primaryError) {
    const candidates = [
      path.resolve(__dirname, "..", "displays", "bundled", LIVE_CHAT_OVERLAY_BUNDLED_FILE),
      path.resolve(
        __dirname,
        "..",
        "..",
        "src",
        "displays",
        "bundled",
        LIVE_CHAT_OVERLAY_BUNDLED_FILE,
      ),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, "utf8");
      }
    }
    throw primaryError instanceof Error
      ? primaryError
      : new Error("Live Chat Overlay bundled HTML is missing.");
  }
}

/**
 * Build a v1 package for capability-based (modular) projects.
 * Includes Live Chat Overlay when live-chat capability is selected.
 */
export function buildModularPackageV1(
  stagingDir: string,
  input: {
    projectKey: string;
    projectSlug: string;
    projectName: string;
    projectType: string;
    description?: string | null;
    capabilities: readonly ProjectCapabilityId[];
  },
): ProjectPackageManifest {
  fs.mkdirSync(stagingDir, { recursive: true });
  const modules = capabilityModulesForPackage(input.capabilities);
  const metaPath = path.join(stagingDir, "project.json");
  const meta = {
    projectKey: input.projectKey,
    projectSlug: input.projectSlug,
    projectName: input.projectName,
    capabilities: [...input.capabilities],
    packageVersion: 1,
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  const includePaths = ["project.json"];
  const displays: ProjectPackageManifest["displays"] = [];

  if (input.capabilities.includes("live-chat")) {
    fs.mkdirSync(path.join(stagingDir, "displays"), { recursive: true });
    const html = loadLiveChatOverlayHtml();
    const htmlRel = LIVE_CHAT_OVERLAY_HTML_PATH;
    fs.writeFileSync(path.join(stagingDir, htmlRel), html, "utf8");
    includePaths.push(htmlRel);
    displays.push({
      key: "live-chat-overlay",
      slug: LIVE_CHAT_OVERLAY_SLUG,
      name: "Live Chat Overlay",
      width: 3840,
      height: 2160,
      aspectRatio: "16:9",
      runtimeAdapterKey: "live-chat-overlay",
      htmlPath: htmlRel,
    });
  }

  const { files, integrityFiles } = buildManifestFileMap(stagingDir, includePaths);

  const manifest: ProjectPackageManifest = {
    kind: PROJECT_PACKAGE_MANIFEST_KIND,
    schemaVersion: PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
    projectKey: input.projectKey,
    projectSlug: input.projectSlug,
    projectName: input.projectName,
    projectType: input.projectType,
    packageVersion: 1,
    description: input.description ?? undefined,
    modules,
    displays,
    files,
    integrity: {
      files: integrityFiles,
    },
  };
  manifest.integrity.manifestHash = hashManifestCanonical(manifest);
  fs.writeFileSync(
    path.join(stagingDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}
