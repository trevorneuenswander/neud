#!/usr/bin/env node
/**
 * Extract + validate DeckLink SDK ZIP for macOS builds.
 * Does not execute any scripts from the archive.
 * Does not redistribute SDK contents into the NEUD installer.
 *
 * Env:
 *   NEUD_DECKLINK_SDK_ZIP — path to downloaded ZIP
 *   NEUD_DECKLINK_SDK_EXTRACT — extract destination
 *   GITHUB_ENV — optional; appends NEUD_DECKLINK_SDK=
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSingleSdkRoot,
  validateMacSdkInclude,
} from "./lib/decklink-sdk-tree.mjs";

const zipPath = (process.env.NEUD_DECKLINK_SDK_ZIP || "").trim();
const extractRoot = path.resolve(
  (process.env.NEUD_DECKLINK_SDK_EXTRACT || "").trim() ||
    (zipPath ? path.join(path.dirname(path.resolve(zipPath)), "DeckLinkSDK-extract") : ""),
);

if (!extractRoot) {
  console.error("Set NEUD_DECKLINK_SDK_EXTRACT or NEUD_DECKLINK_SDK_ZIP.");
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || "").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

if (zipPath) {
  if (!fs.existsSync(zipPath)) {
    console.error(`DeckLink SDK ZIP not found: ${zipPath}`);
    process.exit(1);
  }
  fs.rmSync(extractRoot, { recursive: true, force: true });
  fs.mkdirSync(extractRoot, { recursive: true });
  console.log(`[decklink-sdk] Extracting ${zipPath} → ${extractRoot}`);
  run("ditto", ["-x", "-k", zipPath, extractRoot]);
}

const sdk = assertSingleSdkRoot(extractRoot);
const validated = validateMacSdkInclude(sdk.macInclude);
console.log(`[decklink-sdk] macOS include validated (version ${validated.version})`);

const githubEnv = (process.env.GITHUB_ENV || "").trim();
if (githubEnv) {
  fs.appendFileSync(githubEnv, `NEUD_DECKLINK_SDK=${sdk.root}${os.EOL}`, "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      sdkRoot: sdk.root,
      macInclude: sdk.macInclude,
      version: validated.version,
    },
    null,
    2,
  ),
);
