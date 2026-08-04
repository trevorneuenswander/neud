#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("hosted web shell does not reserve desktop title-bar space", () => {
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  const globals = read("src/app/globals.css");
  const layout = read("src/app/layout.tsx");

  assert.match(layout, /data-runtime/);
  assert.match(shell, /useShellRuntime/);
  assert.match(shell, /runtime === "desktop"/);
  assert.match(globals, /--title-bar-height: 0px/);
  assert.match(globals, /\.overlay-root \{\s*[\s\S]*top: 0;/);
});

test("electron shell retains title-bar offset when desktop runtime is active", () => {
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  assert.match(shell, /--window-menu-height/);
  assert.match(shell, /data-desktop-shell=\{desktopActive \? "true" : "false"\}/);
});

test("hosted portal shell starts content at top without desktop spacer", () => {
  const hostedShell = read("src/components/portal/HostedAppShellFrame.tsx");
  assert.doesNotMatch(hostedShell, /AppTitleBar/);
  assert.doesNotMatch(hostedShell, /title-bar-height/);
  assert.match(hostedShell, /app-shell flex h-full/);
});
