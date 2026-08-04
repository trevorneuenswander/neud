#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("route separation helpers distinguish output, viewer, and preview URLs", () => {
  const mode = readSrc("src/lib/displays/display-view-mode.ts");
  assert.match(mode, /resolveDisplayViewMode/);
  assert.match(mode, /buildProjectDisplayOutputPath/);
  assert.match(mode, /buildProjectDisplayPreviewPath/);
  assert.match(mode, /mode: "output"/);
  assert.match(mode, /preview: "1"/);
});

test("copy local URL uses output mode without preview", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(card, /buildProjectDisplayOutputPath/);
  assert.match(card, /buildProjectDisplayPreviewPath/);
  assert.doesNotMatch(card, /clipboard\.writeText\(localDisplayUrl\)[\s\S]*preview=1/);
  assert.match(service, /mode=output/);
});

test("HtmlDisplayOutputView renders transparent fixed canvas without viewer UI", () => {
  const output = readSrc("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  const live = readSrc("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  assert.match(output, /display-output-root/);
  assert.match(output, /background:\s*"transparent"/);
  assert.match(output, /display-output-iframe/);
  assert.match(output, /buildHtmlDisplayDocumentPath/);
  assert.match(output, /outputMode: true/);
  assert.doesNotMatch(output, /DisplayViewerScaledCanvas/);
  assert.doesNotMatch(output, /Display dimensions:/);
  assert.doesNotMatch(output, /Scale:/);
  assert.doesNotMatch(output, /Button/);
  assert.match(live, /DisplayViewerScaledCanvas/);
});

test("DesktopAppShell bypasses chrome for display output routes", () => {
  const shell = readSrc("src/components/portal/DesktopAppShell.tsx");
  assert.match(shell, /resolveDisplayViewMode/);
  assert.match(shell, /outputRoute/);
});

test("served HTML supports transparent output mode", () => {
  const templates = readSrc("desktop/src/developer-tools/templates.ts");
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(templates, /buildTransparentOutputShellHtml/);
  assert.match(templates, /outputMode\?: boolean/);
  assert.match(templates, /background: transparent !important/);
  assert.match(service, /outputMode/);
  assert.match(service, /buildTransparentOutputShellHtml/);
});

test("view fullscreen keeps preview viewer route separate from output URL", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /buildProjectDisplayPreviewPath/);
  assert.match(card, /buildProjectDisplayOutputPath/);
});

test("display live page routes output mode to HtmlDisplayOutputView", () => {
  const page = readSrc("src/app/display/[projectId]/[slug]/page.tsx");
  const client = readSrc("src/components/displays/DisplayLivePageClient.tsx");
  assert.match(page, /viewMode={viewMode}/);
  assert.match(client, /HtmlDisplayOutputView/);
  assert.match(client, /viewMode === "viewer"/);
});
