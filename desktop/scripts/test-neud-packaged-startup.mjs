#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

test("stage-standalone uses worker-only cookies skip list", () => {
  const source = fs.readFileSync(path.join(desktopRoot, "scripts", "stage-standalone.mjs"), "utf8");
  assert.match(source, /WORKER_SKIP_NAMES[\s\S]*"cookies"/);
  assert.match(source, /context === "worker" && WORKER_SKIP_NAMES\.has\(name\)/);
});

test("staged Next runtime includes @edge-runtime/cookies when staging exists", () => {
  const cookiesModule = path.join(
    desktopRoot,
    "staging",
    "next",
    "node_modules",
    "next",
    "dist",
    "compiled",
    "@edge-runtime",
    "cookies",
  );

  if (!fs.existsSync(path.join(desktopRoot, "staging", "next", "server.js"))) {
    return;
  }

  assert.equal(
    fs.existsSync(cookiesModule),
    true,
    "Missing staged next/dist/compiled/@edge-runtime/cookies — rerun npm run build:desktop",
  );
});

test("electron-builder references build/icon.ico and defers exe icon embedding to rcedit", () => {
  const config = fs.readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");
  const packageJson = fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8");
  assert.match(config, /buildResources: build/);
  assert.match(config, /icon: build\/icon\.ico/);
  assert.match(config, /installerIcon: build\/icon\.ico/);
  assert.match(packageJson, /embed-windows-exe-icon\.mjs/);
});

test("Windows icon asset exists before packaging", () => {
  const buildIcon = path.join(desktopRoot, "build", "icon.ico");
  const assetsIcon = path.join(desktopRoot, "assets", "icon.png");
  assert.equal(fs.existsSync(assetsIcon), true);
  if (fs.existsSync(buildIcon)) {
    assert.ok(fs.statSync(buildIcon).size > 1000, "icon.ico should not be empty");
  }
});

test("bag runtime config uses co-located packaged import", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "bag", "config", "bag-runtime-config.ts"),
    "utf8",
  );
  assert.match(source, /from "\.\/bag-runtime-config\.json"/);
  assert.doesNotMatch(source, /shared\/bag\/bag-runtime-config\.json/);
});

test("electron-builder branding uses NEUD", () => {
  const config = fs.readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");
  const packageJson = fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8");
  assert.match(config, /copyright: © 2026 NEUD/);
  assert.match(config, /productName: NEUD/);
  assert.match(packageJson, /"author": "NEUD"/);
});

test("developer tools no longer read shared browser scripts from repository path", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "developer-tools", "templates.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /shared\/display-runtime\/browser/);
  assert.match(source, /readSharedRuntimeBrowserScript/);
});

test("runtime asset manifest includes normalize-display-snapshot", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(desktopRoot, "runtime-asset-manifest.json"), "utf8"),
  );
  const asset = (manifest.extraResources ?? []).find(
    (entry) => entry.id === "display.normalize-display-snapshot",
  );
  assert.ok(asset);
  assert.equal(
    asset.packagedRelativePath,
    "display/normalize-display-snapshot.js",
  );
});
