import fs from "fs";
import path from "path";
import {
  MIC_TALLY_PACKAGE_BASELINE_VERSION,
  MIC_TALLY_PACKAGE_KEY,
} from "./builtin-package-catalog";
import { buildManifestFileMap, hashManifestCanonical } from "./manifest";
import {
  PROJECT_PACKAGE_MANIFEST_KIND,
  PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "./types";
import { readBundledDisplaySource } from "../lib/bundled-display-sources";

export const MIC_TALLY_THREE_MICS_UHD_HTML_PATH =
  "displays/mic-tally-three-mics-uhd-v1.html";
export const MIC_TALLY_THREE_MICS_UHD_BUNDLED_FILE =
  "mic-tally-three-mics-uhd-v1.html";

function loadBundledMicTallyHtml(bundledFile: string, label: string): string {
  try {
    return readBundledDisplaySource(bundledFile);
  } catch (primaryError) {
    const candidates = [
      path.resolve(__dirname, "..", "displays", "bundled", bundledFile),
      path.resolve(__dirname, "..", "..", "src", "displays", "bundled", bundledFile),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, "utf8");
      }
    }
    throw primaryError instanceof Error
      ? primaryError
      : new Error(`${label} bundled HTML is missing.`);
  }
}

export function loadBundledMicTallyThreeMicsUhdHtml(): string {
  return loadBundledMicTallyHtml(
    MIC_TALLY_THREE_MICS_UHD_BUNDLED_FILE,
    "Mic Tally Three Microphones UHD",
  );
}

export function buildMicTallyPackageV1(outputDirectory: string): ProjectPackageManifest {
  fs.mkdirSync(path.join(outputDirectory, "displays"), { recursive: true });
  const html = loadBundledMicTallyThreeMicsUhdHtml();
  fs.writeFileSync(
    path.join(outputDirectory, MIC_TALLY_THREE_MICS_UHD_HTML_PATH),
    html,
    "utf8",
  );

  const { files, integrityFiles } = buildManifestFileMap(outputDirectory, [
    MIC_TALLY_THREE_MICS_UHD_HTML_PATH,
  ]);

  const manifest: ProjectPackageManifest = {
    kind: PROJECT_PACKAGE_MANIFEST_KIND,
    schemaVersion: PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
    projectKey: MIC_TALLY_PACKAGE_KEY,
    projectSlug: "mic-tally",
    projectName: "Mic Tally",
    projectType: "mic-tally",
    packageVersion: MIC_TALLY_PACKAGE_BASELINE_VERSION,
    minimumNeudVersion: "0.3.2",
    description:
      "Microphone tally graphics driven by Allen & Heath SQ-5 MIDI-over-TCP mute and fader status.",
    modules: [
      { key: "overview", label: "Overview", routeSegment: "" },
      { key: "data-source", label: "Data Source", routeSegment: "data-source" },
      { key: "displays", label: "Displays", routeSegment: "displays" },
      { key: "settings", label: "Settings", routeSegment: "settings" },
    ],
    displays: [
      {
        key: "mic-tally-three-mics-uhd",
        name: "Mic Tally — Three Microphones UHD",
        slug: "mic-tally-three-mics-uhd",
        width: 3840,
        height: 2160,
        aspectRatio: "16:9",
        runtimeAdapterKey: "mic-tally-three-mics-uhd",
        htmlPath: MIC_TALLY_THREE_MICS_UHD_HTML_PATH,
      },
    ],
    sourceAdapters: [
      {
        key: "allen-heath-sq5-tcp-midi",
        label: "Allen & Heath SQ-5 (TCP MIDI)",
        adapterType: "tcp-midi",
      },
    ],
    files,
    integrity: {
      files: integrityFiles,
    },
  };

  manifest.integrity.manifestHash = hashManifestCanonical(manifest);
  fs.writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}
