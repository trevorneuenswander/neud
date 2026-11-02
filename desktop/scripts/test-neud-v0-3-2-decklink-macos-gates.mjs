#!/usr/bin/env node
/**
 * v0.3.2 — macOS packaging must require a real DeckLink addon (parity with Windows).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("root package:mac requires real DeckLink", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts["package:mac"], /NEUD_REQUIRE_REAL_DECKLINK=1/);
});

test("desktop package:mac verifies packaged DeckLink addon", () => {
  const pkg = JSON.parse(read("desktop/package.json"));
  assert.match(pkg.scripts["package:mac"], /verify-packaged-decklink-addon\.mjs --packaged/);
  assert.match(pkg.scripts["package:mac"], /verify-decklink-addon-load\.mjs --packaged/);
  assert.match(pkg.scripts["package:mac"], /verify-packaged-no-decklink-sdk\.mjs/);
});

test("macOS CI workflows provision DeckLink SDK and require real addon", () => {
  for (const workflow of [
    ".github/workflows/release-macos.yml",
    ".github/workflows/build-macos.yml",
    ".github/workflows/build-macos-dev.yml",
  ]) {
    const text = read(workflow);
    assert.match(text, /NEUD_REQUIRE_REAL_DECKLINK:\s*"1"/, workflow);
    assert.match(text, /setup-decklink-sdk-macos/, workflow);
    assert.match(text, /id-token:\s*write/, workflow);
  }
  assert.ok(fs.existsSync(path.join(repoRoot, ".github/actions/setup-decklink-sdk-macos/action.yml")));
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/scripts/ci/prepare-macos-decklink-sdk.mjs")));
  assert.ok(fs.existsSync(path.join(repoRoot, "docs/output-engine/decklink-macos-release.md")));
});

test("login performance bar is gated off public auth routes", () => {
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  assert.match(shell, /isPublicAuthRoute/);
  assert.match(shell, /showPerfBar = desktopActive && !isPublicAuthRoute\(pathname\)/);
  assert.match(shell, /pathname === "\/login"/);
});
