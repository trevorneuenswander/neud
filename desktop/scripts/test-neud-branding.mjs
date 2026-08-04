import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const keyUiFiles = [
  "src/app/(public)/page.tsx",
  "src/components/layout/PublicHeader.tsx",
  "src/components/portal/SidebarBranding.tsx",
  "src/components/portal/AppTitleBar.tsx",
  "src/app/layout.tsx",
  "desktop/src/main.ts",
  "desktop/src/menu/application-menu.ts",
];

test("NeudLogo component exists", () => {
  assert.ok(fs.existsSync(path.join(repoRoot, "src/components/branding/NeudLogo.tsx")));
});

test("key UI files do not show legacy HMG Graphics Server branding", () => {
  for (const file of keyUiFiles) {
    const source = read(file);
    assert.ok(
      !source.includes("HMG Graphics Server"),
      `Expected no legacy branding in ${file}`,
    );
  }
});

test("workspace packages use @neud scope", () => {
  const rootPkg = JSON.parse(read("package.json"));
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  const workerPkg = JSON.parse(read("workers/data-engine/package.json"));

  assert.equal(rootPkg.name, "neud");
  assert.equal(desktopPkg.name, "@neud/desktop");
  assert.equal(workerPkg.name, "@neud/data-engine-worker");
  assert.match(rootPkg.description, /NEUD/);
  assert.match(rootPkg.scripts["dev:desktop:electron"], /@neud\/desktop/);
  assert.match(rootPkg.scripts["dev:desktop:electron"], /NEUD_DESKTOP_DEV/);
});

test("desktop auth messages use NEUD account branding", () => {
  const messages = read("desktop/src/auth/messages.ts");
  const localApi = read("desktop/src/services/local-api-server.ts");
  const authLicense = read("desktop/src/services/auth-license-manager.ts");

  assert.match(messages, /NEUD account/);
  assert.ok(!localApi.includes("HMG account"));
  assert.ok(!authLicense.includes("HMG account"));
});

test("desktop IPC registers neud channels only", () => {
  const channels = read("desktop/src/ipc/channels.ts");
  const preload = read("desktop/src/preload.ts");
  const appIpc = read("desktop/src/ipc/app.ts");

  assert.match(channels, /registerIpcHandler/);
  assert.match(channels, /NEUD_PREFIX/);
  assert.match(preload, /neud:app:getVersion/);
  assert.match(preload, /exposeInMainWorld\("neudDesktop"/);
  assert.ok(!preload.includes('exposeInMainWorld("hmgDesktop"'));
  assert.match(appIpc, /neud:app:getVersion/);
});
