import fs from "fs";
import path from "path";
import {
  SEMA_PACKAGE_BASELINE_VERSION,
  SEMA_PACKAGE_KEY,
} from "./builtin-package-catalog";
import { buildManifestFileMap, hashManifestCanonical } from "./manifest";
import {
  PROJECT_PACKAGE_MANIFEST_KIND,
  PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "./types";
import { readBundledDisplaySource } from "../lib/bundled-display-sources";

export const SEMA_SCHEDULE_TICKER_HTML_PATH = "displays/schedule-ticker-v1.html";
export const SEMA_SCHEDULE_TICKER_BUNDLED_FILE = "sema-schedule-ticker-v1.html";
export const SEMA_SCHEDULE_PYLON_HTML_PATH = "displays/schedule-pylon-v1.html";
export const SEMA_SCHEDULE_PYLON_BUNDLED_FILE = "sema-schedule-pylon-v1.html";
export const SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH =
  "displays/schedule-ticker-editable-v1.html";
export const SEMA_SCHEDULE_TICKER_EDITABLE_BUNDLED_FILE =
  "sema-schedule-ticker-editable-v1.html";

function loadBundledSemaHtml(
  bundledFile: string,
  label: string,
): string {
  try {
    return readBundledDisplaySource(bundledFile);
  } catch (primaryError) {
    // Dev/test fallback when Electron app context is unavailable.
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

export function loadBundledSemaScheduleTickerHtml(): string {
  return loadBundledSemaHtml(
    SEMA_SCHEDULE_TICKER_BUNDLED_FILE,
    "SEMA Schedule Ticker",
  );
}

export function loadBundledSemaSchedulePylonHtml(): string {
  return loadBundledSemaHtml(
    SEMA_SCHEDULE_PYLON_BUNDLED_FILE,
    "SEMA Schedule Pylon",
  );
}

export function loadBundledSemaScheduleTickerEditableHtml(): string {
  return loadBundledSemaHtml(
    SEMA_SCHEDULE_TICKER_EDITABLE_BUNDLED_FILE,
    "SEMA Schedule Ticker Editable",
  );
}

export type SemaPackageHtmlSources = {
  scheduleTickerHtml?: string;
  schedulePylonHtml?: string;
  scheduleTickerEditableHtml?: string;
};

export function buildSemaPackageV1(
  outputDirectory: string,
  scheduleTickerHtmlOrSources: string | SemaPackageHtmlSources = {},
  schedulePylonHtmlArg?: string,
): ProjectPackageManifest {
  // Backward-compatible overload: (dir, tickerHtml?) or (dir, { ticker, pylon, editable })
  let scheduleTickerHtml: string;
  let schedulePylonHtml: string;
  let scheduleTickerEditableHtml: string;
  if (typeof scheduleTickerHtmlOrSources === "string") {
    scheduleTickerHtml = scheduleTickerHtmlOrSources;
    schedulePylonHtml =
      schedulePylonHtmlArg ?? loadBundledSemaSchedulePylonHtml();
    scheduleTickerEditableHtml = loadBundledSemaScheduleTickerEditableHtml();
  } else {
    scheduleTickerHtml =
      scheduleTickerHtmlOrSources.scheduleTickerHtml ??
      loadBundledSemaScheduleTickerHtml();
    schedulePylonHtml =
      scheduleTickerHtmlOrSources.schedulePylonHtml ??
      loadBundledSemaSchedulePylonHtml();
    scheduleTickerEditableHtml =
      scheduleTickerHtmlOrSources.scheduleTickerEditableHtml ??
      loadBundledSemaScheduleTickerEditableHtml();
  }

  fs.mkdirSync(path.join(outputDirectory, "displays"), { recursive: true });
  fs.mkdirSync(path.join(outputDirectory, "displays", "assets"), { recursive: true });
  const absoluteTickerHtml = path.join(outputDirectory, SEMA_SCHEDULE_TICKER_HTML_PATH);
  const absolutePylonHtml = path.join(outputDirectory, SEMA_SCHEDULE_PYLON_HTML_PATH);
  const absoluteEditableHtml = path.join(
    outputDirectory,
    SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH,
  );
  fs.writeFileSync(absoluteTickerHtml, scheduleTickerHtml, "utf8");
  fs.writeFileSync(absolutePylonHtml, schedulePylonHtml, "utf8");
  fs.writeFileSync(absoluteEditableHtml, scheduleTickerEditableHtml, "utf8");

  const logoAssetRel = "displays/assets/sema-live-autozone-logo.png";
  const logoCandidates = [
    path.resolve(__dirname, "..", "displays", "bundled", "assets", "sema-live-autozone-logo.png"),
    path.resolve(
      __dirname,
      "..",
      "..",
      "src",
      "displays",
      "bundled",
      "assets",
      "sema-live-autozone-logo.png",
    ),
    path.resolve(process.cwd(), "public", "displays", "sema", "sema-live-autozone-logo.png"),
  ];
  const logoSource = logoCandidates.find((candidate) => fs.existsSync(candidate));
  if (logoSource) {
    fs.copyFileSync(logoSource, path.join(outputDirectory, logoAssetRel));
  }

  const { files, integrityFiles } = buildManifestFileMap(outputDirectory, [
    SEMA_SCHEDULE_TICKER_HTML_PATH,
    SEMA_SCHEDULE_PYLON_HTML_PATH,
    SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH,
    ...(logoSource ? [logoAssetRel] : []),
  ]);

  const manifest: ProjectPackageManifest = {
    kind: PROJECT_PACKAGE_MANIFEST_KIND,
    schemaVersion: PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
    projectKey: SEMA_PACKAGE_KEY,
    projectSlug: "sema",
    projectName: "SEMA",
    projectType: "sema-schedule",
    packageVersion: SEMA_PACKAGE_BASELINE_VERSION,
    minimumNeudVersion: "0.3.0",
    description:
      "SEMA schedule graphics driven by Google Sheets with local controller backup.",
    modules: [
      { key: "overview", label: "Overview", routeSegment: "" },
      { key: "data-source", label: "Data Source", routeSegment: "google-sheet" },
      { key: "controller", label: "Manual Controller", routeSegment: "controller" },
      { key: "displays", label: "Displays", routeSegment: "displays" },
      { key: "settings", label: "Settings", routeSegment: "settings" },
    ],
    displays: [
      {
        key: "schedule-ticker",
        name: "Schedule Ticker",
        slug: "schedule-ticker",
        width: 3840,
        height: 2160,
        aspectRatio: "16:9",
        runtimeAdapterKey: "sema-schedule-ticker",
        htmlPath: SEMA_SCHEDULE_TICKER_HTML_PATH,
      },
      {
        key: "schedule-pylon",
        name: "Schedule Pylon",
        slug: "schedule-pylon",
        width: 3840,
        height: 2160,
        aspectRatio: "16:9",
        runtimeAdapterKey: "sema-schedule-pylon",
        htmlPath: SEMA_SCHEDULE_PYLON_HTML_PATH,
      },
      {
        key: "schedule-ticker-editable",
        name: "Schedule Ticker Editable",
        slug: "schedule-ticker-editable",
        width: 3840,
        height: 2160,
        aspectRatio: "16:9",
        runtimeAdapterKey: "sema-schedule-ticker-editable",
        htmlPath: SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH,
      },
    ],
    sourceAdapters: [
      {
        key: "google-sheets",
        label: "Data Source",
        adapterType: "google-sheets",
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
