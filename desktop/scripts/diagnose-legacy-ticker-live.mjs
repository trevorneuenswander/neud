#!/usr/bin/env node
/**
 * End-to-end legacy-live ticker diagnostic.
 * Reads the same APPDATA database path as publish-legacy-ticker-live.mjs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { DeveloperToolsService } from "../dist/services/developer-tools-service.js";
import { LocalDataService } from "../dist/services/local-data-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function resolveCliAppPaths() {
  const appDataRoot = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const root = path.join(appDataRoot, "NEUD");
  const dataDir = path.join(root, "data");
  return {
    root,
    data: dataDir,
    databaseFile: path.join(dataDir, "neud.sqlite"),
    projects: path.join(root, "projects"),
    repoRoot,
  };
}

function readBundledLegacyLive() {
  const bundledPath = path.join(
    repoRoot,
    "desktop/src/displays/bundled/auction-ticker-legacy-live-v1-2026-07-26-132400.html",
  );
  return fs.existsSync(bundledPath) ? fs.readFileSync(bundledPath, "utf8") : null;
}

async function fetchDisplayHtml(projectId, slug, preview = true) {
  const query = preview ? "?preview=1&poll=1000" : "?poll=1000";
  const localUrl = `http://127.0.0.1:8070/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}${query}`;
  const proxyUrl = `http://127.0.0.1:3000/api/display-html/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}${query}`;

  for (const [label, url] of [
    ["local-api", localUrl],
    ["next-proxy", proxyUrl],
  ]) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const html = await response.text();
      return { label, url, status: response.status, html, headers: Object.fromEntries(response.headers) };
    } catch (error) {
      // try next
    }
  }
  return null;
}

async function fetchDisplayData(projectId, slug, preview = true) {
  const query = preview ? "?preview=1" : "";
  const url = `http://127.0.0.1:8070/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}/data${query}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    const json = await response.json();
    return { url, status: response.status, json };
  } catch {
    return null;
  }
}

async function main() {
  const paths = resolveCliAppPaths();
  console.log("=== NEUD Legacy-Live Ticker Diagnostic ===\n");
  console.log(`Database path: ${paths.databaseFile}`);
  console.log(`Database exists: ${fs.existsSync(paths.databaseFile)}`);

  if (!fs.existsSync(paths.databaseFile)) {
    process.exit(1);
  }

  const db = await openLocalDatabase(paths);
  const projects = new ProjectsRepository(db);
  const displays = new DisplaysRepository(db);
  const displayCode = new ProjectDisplayCodeRepository(db);
  const revisions = new ProjectCodeRevisionsRepository(db);
  const storage = new ProjectCodeStorageService(paths);

  const tickerPattern = /ticker|auction-ticker|legacy/i;
  const allDisplays = [];
  for (const project of projects.list()) {
    for (const display of displays.listByProject(project.id)) {
      if (
        tickerPattern.test(display.displayKey ?? "") ||
        tickerPattern.test(display.name ?? "")
      ) {
        const code = displayCode.getBySlug(project.id, display.displayKey);
        const revision = code?.publishedRevisionId
          ? revisions.getById(code.publishedRevisionId)
          : null;
        allDisplays.push({
          displayId: display.id,
          projectId: project.id,
          projectSlug: project.slug,
          slug: display.displayKey,
          name: display.name,
          activeRevisionId: code?.publishedRevisionId ?? null,
          activeRevisionName: revision?.revisionName ?? null,
          archived: code?.archived ?? false,
          enabled: display.enabled,
          rendererKey:
            display.settings && typeof display.settings === "object"
              ? display.settings.rendererKey
              : null,
          updatedAt: display.updatedAt,
        });
      }
    }
  }

  console.log("\n--- Matching ticker displays ---");
  for (const row of allDisplays) {
    console.log(JSON.stringify(row, null, 2));
  }

  const bundled = readBundledLegacyLive();
  if (bundled) {
    console.log("\n--- Bundled legacy-live HTML ---");
    console.log(`Byte length: ${Buffer.byteLength(bundled, "utf8")}`);
    console.log(`SHA-256: ${sha256(bundled)}`);
    console.log(`Has initializeNeudTickerBridge: ${/initializeNeudTickerBridge/.test(bundled)}`);
    console.log(`Has unconditional poll(): ${/poll\(\);\s*setInterval\(poll,\s*POLL\);/.test(bundled)}`);
    console.log(`Has __NEUD_TICKER_REVISION__: ${/__NEUD_TICKER_REVISION__/.test(bundled)}`);
  }

  for (const row of allDisplays) {
    const published = storage.readDisplayPublished(row.projectId, row.displayId);
    if (!published) {
      console.log(`\n--- ${row.slug}: NO published filesystem bundle ---`);
      continue;
    }

    console.log(`\n--- Filesystem published: ${row.slug} ---`);
    console.log(`Byte length: ${Buffer.byteLength(published.html, "utf8")}`);
    console.log(`SHA-256: ${sha256(published.html)}`);
    console.log(`Revision metadata: ${JSON.stringify(published.metadata ?? {})}`);
    console.log(`Has initializeNeudTickerBridge: ${/initializeNeudTickerBridge/.test(published.html)}`);
    console.log(`Has unconditional poll(): ${/poll\(\);\s*setInterval\(poll,\s*POLL\);/.test(published.html)}`);
    console.log(`Has __NEUD_TICKER_REVISION__: ${/__NEUD_TICKER_REVISION__/.test(published.html)}`);
    if (bundled) {
      console.log(`Matches bundled SHA-256: ${sha256(published.html) === sha256(bundled)}`);
    }

    const served = await fetchDisplayHtml(row.projectId, row.slug, true);
    if (served) {
      console.log(`\n--- Served HTML via ${served.label} ---`);
      console.log(`URL: ${served.url}`);
      console.log(`Status: ${served.status}`);
      console.log(`Cache-Control: ${served.headers["cache-control"] ?? "(none)"}`);
      console.log(`Byte length: ${Buffer.byteLength(served.html, "utf8")}`);
      console.log(`SHA-256: ${sha256(served.html)}`);
      console.log(`Has initializeNeudTickerBridge: ${/initializeNeudTickerBridge/.test(served.html)}`);
      console.log(`Has neud-display-runtime.js: ${/neud-display-runtime\.js/.test(served.html)}`);
      console.log(`Has window.NEUDDisplay stub: ${/window\.NEUDDisplay/.test(served.html)}`);
      console.log(`Has unconditional poll() in served doc: ${/poll\(\);\s*setInterval\(poll,\s*POLL\);/.test(served.html)}`);
      console.log(`Matches filesystem published (raw): ${sha256(served.html) === sha256(published.html)}`);

      const diagPath = path.join(os.tmpdir(), `neud-ticker-served-${row.slug}.html`);
      fs.writeFileSync(diagPath, served.html, "utf8");
      console.log(`Saved served HTML: ${diagPath}`);
    } else {
      console.log("\n--- Served HTML: local API / Next proxy not reachable ---");
    }

    const data = await fetchDisplayData(row.projectId, row.slug, true);
    if (data) {
      const payload = data.json;
      console.log(`\n--- Display data endpoint (${row.slug}) ---`);
      console.log(`URL: ${data.url}`);
      console.log(`Status: ${data.status}`);
      console.log(`Top-level keys: ${Object.keys(payload).join(", ")}`);
      console.log(
        `broadArrowDisplay.ticker.next: ${JSON.stringify(payload.broadArrowDisplay?.ticker?.next ?? null)}`,
      );
      console.log(`snapshot.next (first 3): ${JSON.stringify((payload.snapshot?.next ?? payload.next ?? []).slice(0, 3))}`);
      console.log(`top-level next (first 3): ${JSON.stringify((payload.next ?? []).slice(0, 3))}`);

      // Simulate runtime resolveCanonicalSnapshot from neud-display-runtime.js
      const candidate =
        payload.snapshot && typeof payload.snapshot === "object"
          ? payload.snapshot
          : payload.broadArrowDisplay && typeof payload.broadArrowDisplay === "object"
            ? payload.broadArrowDisplay
            : payload;
      let runtimeSnapshot = candidate;
      if (candidate && (candidate.pylon || candidate.ticker)) {
        const merged = {};
        if (candidate.ticker && Array.isArray(candidate.ticker.next)) {
          merged.next = candidate.ticker.next;
        }
        runtimeSnapshot = merged;
      }
      console.log(`Runtime subscriber would receive next: ${JSON.stringify(runtimeSnapshot.next ?? null)}`);
    }
  }

  await closeLocalDatabase(db);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
