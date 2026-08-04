#!/usr/bin/env node
/**
 * Inspect legacy-ticker revisions from local NEUD database and filesystem.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import {
  applyHtmlDisplayRuntimeAdapters,
  resolveDisplayRuntimeAdapterKey,
} from "../dist/displays/html-display-runtime-adapters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    backups: path.join(dataDir, "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot: path.resolve(__dirname, "../.."),
  };
}

async function main() {
  const paths = resolveCliAppPaths();
  console.log("=== Legacy Ticker Revision Inspection ===\n");
  console.log(`Database: ${paths.databaseFile}`);
  console.log(`Exists: ${fs.existsSync(paths.databaseFile)}\n`);

  if (!fs.existsSync(paths.databaseFile)) {
    console.log("No local database found. Using bundled revision proxies for diagnosis.\n");
    inspectBundledProxies();
    return;
  }

  const db = await openLocalDatabase(paths);
  const projects = new ProjectsRepository(db);
  const displayCode = new ProjectDisplayCodeRepository(db);
  const revisionsRepo = new ProjectCodeRevisionsRepository(db);
  const storage = new ProjectCodeStorageService(paths);

  let found = false;
  for (const project of projects.list()) {
    const code = displayCode.getBySlug(project.id, "legacy-ticker");
    if (!code) continue;
    found = true;

    const revisions = revisionsRepo
      .listForResource({
        projectId: project.id,
        resourceType: "display",
        resourceId: code.displayId,
      })
      .sort((left, right) => (left.versionNumber ?? 0) - (right.versionNumber ?? 0));

    console.log(`Project: ${project.name} (${project.slug})`);
    console.log(`Display slug: ${code.slug}`);
    console.log(`Active revision ID: ${code.publishedRevisionId ?? "(none)"}\n`);

    const adapterContext = {
      projectId: project.id,
      projectSlug: project.slug,
      displayId: code.displayId,
      slug: code.slug,
      displayKey: "legacy-ticker",
      settings: { runtimeAdapterKey: resolveDisplayRuntimeAdapterKey({
        projectId: project.id,
        projectSlug: project.slug,
        displayId: code.displayId,
        slug: code.slug,
        displayKey: "legacy-ticker",
        settings: {},
      }) },
    };

    for (const revision of revisions) {
      const storageRevisionId =
        typeof revision.metadata.storageRevisionId === "string"
          ? revision.metadata.storageRevisionId
          : revision.id;
      const bundle = storage.readDisplayRevision(
        project.id,
        code.displayId,
        storageRevisionId,
      );
      if (!bundle) {
        console.log(`v${revision.versionNumber ?? "?"}: missing filesystem bundle`);
        continue;
      }

      const storedHash = sha256(bundle.html);
      const servedHtml = applyHtmlDisplayRuntimeAdapters(bundle.html, adapterContext);
      const servedHash = sha256(servedHtml);
      const isActive = revision.id === code.publishedRevisionId;

      console.log(`v${revision.versionNumber ?? "?"}`);
      console.log(`  Revision ID: ${revision.id}`);
      console.log(`  Description: ${revision.revisionName ?? revision.message ?? "(none)"}`);
      console.log(`  Active: ${isActive ? "yes" : "no"}`);
      console.log(`  Stored HTML hash: ${storedHash}`);
      console.log(`  Served HTML hash: ${servedHash}`);
      console.log(
        `  Stored has initializeNeudTickerBridge: ${/initializeNeudTickerBridge/.test(bundle.html)}`,
      );
      console.log(
        `  Served has initializeNeudTickerBridge: ${/initializeNeudTickerBridge/.test(servedHtml)}`,
      );
      console.log(
        `  Served has /neud-display-runtime.js path: ${/neud-display-runtime\.js/.test(servedHtml)}`,
      );
      console.log(
        `  Stored has unconditional poll(): ${/poll\(\);\s*setInterval\(poll,\s*POLL\);/.test(bundle.html)}`,
      );
      console.log(
        `  Served poll startup guarded: ${/if \(!window\.__NEUD_RUNTIME_MANAGED_DISPLAY__\)/.test(servedHtml) || /initializeNeudTickerBridge/.test(bundle.html)}`,
      );
      console.log("");
    }
  }

  if (!found) {
    console.log("No legacy-ticker display found in database. Using bundled proxies.\n");
    inspectBundledProxies();
  }

  await closeLocalDatabase(db);
}

function inspectBundledProxies() {
  const repoRoot = path.resolve(__dirname, "../..");
  const version1 = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/bundled/auction-ticker-overlay-v1.html"),
    "utf8",
  );
  const version2 = fs.readFileSync(
    path.join(
      repoRoot,
      "desktop/src/displays/bundled/auction-ticker-legacy-live-v1-2026-07-26-132400.html",
    ),
    "utf8",
  );
  const context = {
    projectId: "proxy",
    projectSlug: "broad-arrow-auctions",
    displayId: "proxy",
    slug: "legacy-ticker",
    displayKey: "legacy-ticker",
    settings: { runtimeAdapterKey: "broad-arrow-legacy-ticker" },
  };

  for (const [label, html] of [
    ["v1 (original upload proxy)", version1],
    ["v2 (legacy-live proxy)", version2],
  ]) {
    const served = applyHtmlDisplayRuntimeAdapters(html, context);
    console.log(label);
    console.log(`  Stored hash: ${sha256(html)}`);
    console.log(`  Served hash: ${sha256(served)}`);
    console.log(`  Stored bridge: ${/initializeNeudTickerBridge/.test(html)}`);
    console.log(`  Served bridge: ${/initializeNeudTickerBridge/.test(served)}`);
    console.log(`  Stored poll(): ${/poll\(\);\s*setInterval\(poll,\s*POLL\);/.test(html)}`);
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
