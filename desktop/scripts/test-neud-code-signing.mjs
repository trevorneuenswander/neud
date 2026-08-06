#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("release workflow defaults Authenticode signing to disabled", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /require_code_signing:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /NEUD_REQUIRE_CODE_SIGNING: \$\{\{ inputs\.require_code_signing/);
  assert.doesNotMatch(workflow, /NEUD_REQUIRE_CODE_SIGNING: "1"/);
});

test("unsigned Alpha release workflow can proceed without CSC secrets", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /Building unsigned Alpha release/);
  assert.match(workflow, /if: inputs\.require_code_signing == true/);
  assert.match(workflow, /verify-code-signing-config\.mjs/);
  assert.match(workflow, /npm run release:win/);
  assert.match(workflow, /verify-packaged-auto-update-config\.mjs --require-latest-yml/);
  assert.match(workflow, /app-update\.yml/);
});

test("signed release mode requires CSC secrets before npm ci", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /CSC_LINK/);
  assert.match(workflow, /CSC_KEY_PASSWORD/);
  assert.match(workflow, /Building signed release \(Authenticode signing required\)\./);

  const validateIndex = workflow.indexOf("Validate Windows code signing configuration");
  const npmCiIndex = workflow.indexOf("npm ci");
  assert.ok(validateIndex >= 0 && validateIndex < npmCiIndex);

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

test("Authenticode verification runs only when signing is required", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  const verifyStep = workflow.match(
    /- name: Verify Authenticode signatures[\s\S]*?run: pwsh -NoProfile -File desktop\/scripts\/verify-authenticode-signatures\.ps1/,
  );
  assert.ok(verifyStep, "Expected Authenticode verification step");
  assert.match(verifyStep[0], /if: inputs\.require_code_signing == true/);
});

test("non-signing release gates remain in workflow", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /Validate public Supabase configuration/);
  assert.match(workflow, /test:neud-release-version/);
  assert.match(workflow, /test:neud-auto-update/);
  assert.match(workflow, /test:neud-update-session-logout/);
  assert.match(workflow, /Guard against overwriting an existing published release/);
  assert.match(workflow, /workflow_dispatch/);
});

test("electron-builder configures SHA-256 Authenticode timestamping", () => {
  const config = read("desktop/electron-builder.yml");
  assert.match(config, /signAndEditExecutable: false/);
  assert.match(config, /digestAlgorithm: sha256/);
  assert.match(config, /timestampDigestAlgorithm: sha256/);
  assert.match(config, /rfc3161TimeStampServer:/);
});

test("package:win retains signing hooks for future signed releases", () => {
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.match(desktopPkg.scripts["package:win"], /verify-code-signing-config\.mjs/);
  assert.match(desktopPkg.scripts["package:win"], /verify-authenticode-signatures\.ps1/);
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
