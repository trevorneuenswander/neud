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

test("hosted runtime sets zero title bar offset by default", () => {
  const globals = read("src/app/globals.css");
  assert.match(globals, /--title-bar-height: 0px/);
  assert.match(globals, /html\[data-runtime="desktop"\]/);
});

test("root layout marks hosted vs desktop runtime before hydration", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /data-runtime=\{runtime\}/);
  assert.match(layout, /isDesktopRuntime\(\)/);
});

test("desktop shell only reserves title bar when runtime and electron are active", () => {
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  assert.match(shell, /data-runtime=\{runtime\}/);
  assert.match(shell, /runtime === "desktop"/);
  assert.match(shell, /top: desktopActive \? "var\(--window-menu-height, 0px\)" : 0/);
  assert.doesNotMatch(shell, /AppTitleBar active={false}/);
});

test("hosted portal shell does not render desktop title bar", () => {
  const hostedShell = read("src/components/portal/HostedAppShell.tsx");
  assert.doesNotMatch(hostedShell, /AppTitleBar/);
});
