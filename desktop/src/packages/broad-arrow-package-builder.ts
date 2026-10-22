import fs from "fs";
import path from "path";
import { BROAD_ARROW_STREAM_DISPLAY_SPECS } from "../displays/broad-arrow-stream-display-specs";
import {
  LEGACY_PYLON_SPEC,
  LEGACY_TICKER_SPEC,
} from "../displays/broad-arrow-legacy-display-specs";
import { readBundledDisplaySourceFromReference } from "../lib/bundled-display-sources";
import {
  BROAD_ARROW_PACKAGE_BASELINE_VERSION,
  BROAD_ARROW_PACKAGE_KEY,
} from "./builtin-package-catalog";
import { buildManifestFileMap, hashManifestCanonical } from "./manifest";
import {
  PROJECT_PACKAGE_MANIFEST_KIND,
  PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "./types";

export const BROAD_ARROW_PACKAGE_DISPLAYS = [
  ...BROAD_ARROW_STREAM_DISPLAY_SPECS.map((spec) => ({
    key: spec.slug,
    name: spec.name,
    slug: spec.slug,
    width: spec.displayWidth,
    height: spec.displayHeight,
    aspectRatio: "16:9",
    htmlPath: `displays/${spec.bundledRelativePath}`,
    bundledRelativePath: spec.bundledRelativePath,
    runtimeAdapterKey: undefined as string | undefined,
  })),
  {
    key: LEGACY_PYLON_SPEC.slug,
    name: LEGACY_PYLON_SPEC.name,
    slug: LEGACY_PYLON_SPEC.slug,
    width: LEGACY_PYLON_SPEC.displayWidth,
    height: LEGACY_PYLON_SPEC.displayHeight,
    aspectRatio: "16:9",
    htmlPath: `displays/${LEGACY_PYLON_SPEC.bundledV1RelativePath}`,
    bundledRelativePath: LEGACY_PYLON_SPEC.bundledV1RelativePath,
    runtimeAdapterKey: LEGACY_PYLON_SPEC.runtimeAdapterKey,
  },
  {
    key: LEGACY_TICKER_SPEC.slug,
    name: LEGACY_TICKER_SPEC.name,
    slug: LEGACY_TICKER_SPEC.slug,
    width: LEGACY_TICKER_SPEC.displayWidth,
    height: LEGACY_TICKER_SPEC.displayHeight,
    aspectRatio: "16:9",
    htmlPath: `displays/${LEGACY_TICKER_SPEC.bundledV1RelativePath}`,
    bundledRelativePath: LEGACY_TICKER_SPEC.bundledV1RelativePath,
    runtimeAdapterKey: LEGACY_TICKER_SPEC.runtimeAdapterKey,
  },
] as const;

/**
 * Materialize Broad Arrow package v1 into a directory (staging or export).
 * Baseline package version for v0.3.0 migration is intentionally v1.
 */
export function buildBroadArrowPackageV1(outputDirectory: string): ProjectPackageManifest {
  fs.mkdirSync(path.join(outputDirectory, "displays"), { recursive: true });

  const relativePaths: string[] = [];
  for (const display of BROAD_ARROW_PACKAGE_DISPLAYS) {
    const html = readBundledDisplaySourceFromReference(display.bundledRelativePath);
    const relativePath = display.htmlPath;
    const absolutePath = path.join(outputDirectory, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, html, "utf8");
    relativePaths.push(relativePath);
  }

  const { files, integrityFiles } = buildManifestFileMap(outputDirectory, relativePaths);

  const manifest: ProjectPackageManifest = {
    kind: PROJECT_PACKAGE_MANIFEST_KIND,
    schemaVersion: PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
    projectKey: BROAD_ARROW_PACKAGE_KEY,
    projectSlug: "broad-arrow-auctions",
    projectName: "Broad Arrow Auctions",
    projectType: "bag-graphics",
    packageVersion: BROAD_ARROW_PACKAGE_BASELINE_VERSION,
    minimumNeudVersion: "0.3.0",
    description:
      "Broad Arrow auction graphics powered by the BAG auction scraper.",
    modules: [
      { key: "overview", label: "Overview", routeSegment: "" },
      { key: "data-engines", label: "Data Engines", routeSegment: "data-engines" },
      { key: "controller", label: "Manual Controller", routeSegment: "controller" },
      { key: "displays", label: "Displays", routeSegment: "displays" },
      { key: "settings", label: "Settings", routeSegment: "settings" },
    ],
    displays: BROAD_ARROW_PACKAGE_DISPLAYS.map((display) => ({
      key: display.key,
      name: display.name,
      slug: display.slug,
      width: display.width,
      height: display.height,
      aspectRatio: display.aspectRatio,
      runtimeAdapterKey: display.runtimeAdapterKey,
      htmlPath: display.htmlPath,
    })),
    sourceAdapters: [
      {
        key: "webpage-scraper",
        label: "Webpage Scraper",
        adapterType: "webpage-scraper",
      },
    ],
    files,
    integrity: {
      files: integrityFiles,
    },
    installHooks: {
      onFirstInstall: ["refresh-currency-rates"],
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
