#!/usr/bin/env node
/**
 * Extract + validate DeckLink SDK ZIP for Windows builds.
 * Runs MIDL to generate DeckLinkAPI.h from IDL when needed.
 * Does not execute any scripts from the archive.
 *
 * Env:
 *   NEUD_DECKLINK_SDK_ZIP — path to downloaded ZIP (required unless NEUD_DECKLINK_SDK_EXTRACT already set)
 *   NEUD_DECKLINK_SDK_EXTRACT — extract destination (default: beside ZIP / runner temp)
 *   GITHUB_ENV — optional; appends NEUD_DECKLINK_SDK=
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertSingleSdkRoot,
  validateWindowsSdkInclude,
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

function findMidl() {
  const fromEnv = (process.env.NEUD_MIDL_PATH || "").trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const vswhere = path.join(
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (fs.existsSync(vswhere)) {
    const result = spawnSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-find",
        "**\\midl.exe",
      ],
      { encoding: "utf8" },
    );
    const candidate = (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith("midl.exe") && fs.existsSync(line));
    if (candidate) return candidate;
  }

  const pathMidl = spawnSync("where.exe", ["midl.exe"], { encoding: "utf8", shell: true });
  const which = (pathMidl.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && fs.existsSync(line));
  if (which) return which;
  throw new Error("midl.exe not found. Install Visual Studio C++ build tools with MIDL.");
}

function extractZip(zip, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  if (process.platform === "win32") {
    run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  run("unzip", ["-q", zip, "-d", dest]);
}

if (zipPath) {
  if (!fs.existsSync(zipPath)) {
    console.error(`SDK ZIP not found: ${zipPath}`);
    process.exit(1);
  }
  console.log(`[decklink-sdk] Extracting archive to ${extractRoot}`);
  extractZip(path.resolve(zipPath), extractRoot);
} else if (!fs.existsSync(extractRoot)) {
  console.error(`Extract root missing: ${extractRoot}`);
  process.exit(1);
}

const sdk = assertSingleSdkRoot(extractRoot);
console.log(`[decklink-sdk] Resolved SDK root: ${sdk.root}`);

validateWindowsSdkInclude(sdk.winInclude, { requireGeneratedHeader: false });

const headerPath = path.join(sdk.winInclude, "DeckLinkAPI.h");
if (!fs.existsSync(headerPath)) {
  if (process.platform !== "win32") {
    console.error("DeckLinkAPI.h missing and MIDL generation requires Windows.");
    process.exit(1);
  }
  const midl = findMidl();
  console.log(`[decklink-sdk] Generating Windows headers with MIDL`);
  // MIDL writes DeckLinkAPI.h / DeckLinkAPI_i.c into cwd; keep inputs in Win/include.
  run(
    midl,
    [
      "/W1",
      "/robust",
      "/nologo",
      `/I${sdk.winInclude}`,
      "/h",
      "DeckLinkAPI.h",
      "/iid",
      "DeckLinkAPI_i.c",
      "DeckLinkAPI.idl",
    ],
    { cwd: sdk.winInclude },
  );
}

const validated = validateWindowsSdkInclude(sdk.winInclude, { requireGeneratedHeader: true });
console.log(`[decklink-sdk] Windows include validated (version ${validated.version})`);

const githubEnv = (process.env.GITHUB_ENV || "").trim();
if (githubEnv) {
  fs.appendFileSync(githubEnv, `NEUD_DECKLINK_SDK=${sdk.root}${os.EOL}`, "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      sdkRoot: sdk.root,
      winInclude: sdk.winInclude,
      version: validated.version,
    },
    null,
    2,
  ),
);
