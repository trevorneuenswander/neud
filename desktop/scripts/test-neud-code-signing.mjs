#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("release workflow requires signing credentials when NEUD_REQUIRE_CODE_SIGNING=1", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /NEUD_REQUIRE_CODE_SIGNING/);
  assert.match(workflow, /CSC_LINK/);
  assert.match(workflow, /CSC_KEY_PASSWORD/);
  assert.match(workflow, /verify-code-signing-config\.mjs/);
  assert.match(workflow, /verify-authenticode-signatures\.ps1/);
  assert.match(workflow, /Guard against overwriting an existing published release/);
});

test("electron-builder configures SHA-256 Authenticode timestamping", () => {
  const config = read("desktop/electron-builder.yml");
  assert.match(config, /signAndEditExecutable: false/);
  assert.match(config, /digestAlgorithm: sha256/);
  assert.match(config, /timestampDigestAlgorithm: sha256/);
  assert.match(config, /rfc3161TimeStampServer:/);
});

test("package:win verifies Authenticode signatures after NSIS packaging", () => {
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.match(desktopPkg.scripts["package:win"], /verify-code-signing-config\.mjs/);
  assert.match(desktopPkg.scripts["package:win"], /verify-authenticode-signatures\.ps1/);
  assert.match(desktopPkg.scripts["package:win"], /embed-windows-exe-icon\.mjs/);
  const embedIndex = desktopPkg.scripts["package:win"].indexOf("embed-windows-exe-icon");
  const nsisIndex = desktopPkg.scripts["package:win"].indexOf("--prepackaged");
  assert.ok(embedIndex >= 0 && embedIndex < nsisIndex);
});

test("unsigned release build fails when NEUD_REQUIRE_CODE_SIGNING=1 without CSC secrets", () => {
  assert.throws(
    () => {
      execSync("node desktop/scripts/verify-code-signing-config.mjs", {
        cwd: repoRoot,
        env: {
          ...process.env,
          NEUD_REQUIRE_CODE_SIGNING: "1",
          CSC_LINK: "",
          CSC_KEY_PASSWORD: "",
        },
        stdio: "pipe",
      });
    },
    (error) => error.status === 1,
  );
});

test("local development remains possible without signing credentials", () => {
  const output = execSync("node desktop/scripts/verify-code-signing-config.mjs", {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEUD_REQUIRE_CODE_SIGNING: "",
      CSC_LINK: "",
      CSC_KEY_PASSWORD: "",
    },
  }).toString("utf8");
  assert.match(output, /unsigned local builds are allowed/);
});

test("verify script checks NEUD.exe and versioned installer", () => {
  const verify = read("desktop/scripts/verify-authenticode-signatures.ps1");
  assert.match(verify, /win-unpacked\\NEUD\.exe/);
  assert.match(verify, /NEUD-Setup-\$version-x64\.exe/);
  assert.match(verify, /verify \/pa \/v \/ts/);
  assert.match(verify, /TimeStamperCertificate/);
});

test("repository does not commit PFX or certificate secrets", () => {
  const forbidden = [];
  for (const relativePath of [
    "desktop/electron-builder.yml",
    "desktop/package.json",
    ".github/workflows/release-windows.yml",
    "desktop/scripts/verify-code-signing-config.mjs",
  ]) {
    const contents = read(relativePath);
    if (/BEGIN CERTIFICATE|PRIVATE KEY|\.pfx/i.test(contents)) {
      forbidden.push(relativePath);
    }
  }
  assert.deepEqual(forbidden, []);
});

test("Authenticode verification script skips when signing is not required", () => {
  const verify = read("desktop/scripts/verify-authenticode-signatures.ps1");
  assert.match(verify, /NEUD_REQUIRE_CODE_SIGNING is not set/);
});
