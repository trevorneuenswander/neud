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

function collectMidlCandidates() {
  const found = [];
  const fromEnv = (process.env.NEUD_MIDL_PATH || "").trim();
  if (fromEnv) found.push(fromEnv);

  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";

  // MIDL ships with the Windows SDK (Windows Kits), not always under VS VC tools.
  for (const kitsRoot of [
    path.join(programFilesX86, "Windows Kits", "10", "bin"),
    path.join(programFiles, "Windows Kits", "10", "bin"),
  ]) {
    if (!fs.existsSync(kitsRoot)) continue;
    const versions = fs
      .readdirSync(kitsRoot)
      .filter((name) => /^\d+\.\d+\.\d+\.\d+$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const versionDir of versions.reverse()) {
      for (const arch of ["x64", "x86"]) {
        found.push(path.join(kitsRoot, versionDir, arch, "midl.exe"));
      }
    }
  }

  const vswhere = path.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (fs.existsSync(vswhere)) {
    const result = spawnSync(
      vswhere,
      ["-latest", "-products", "*", "-find", "**/midl.exe"],
      { encoding: "utf8" },
    );
    for (const line of (result.stdout || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) found.push(trimmed);
    }

    // Load vcvars and resolve midl via PATH (covers Enterprise/Community images).
    const vsPathResult = spawnSync(
      vswhere,
      ["-latest", "-products", "*", "-property", "installationPath"],
      { encoding: "utf8" },
    );
    const vsPath = (vsPathResult.stdout || "").trim().split(/\r?\n/)[0];
    if (vsPath) {
      const vcvars = path.join(vsPath, "VC", "Auxiliary", "Build", "vcvars64.bat");
      if (fs.existsSync(vcvars)) {
        const whereMidl = spawnSync(
          "cmd.exe",
          ["/d", "/s", "/c", `"${vcvars}" >nul 2>&1 && where midl`],
          { encoding: "utf8", shell: false },
        );
        for (const line of (whereMidl.stdout || "").split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.toLowerCase().endsWith("midl.exe")) found.push(trimmed);
        }
      }
    }
  }

  const pathMidl = spawnSync("where.exe", ["midl.exe"], { encoding: "utf8", shell: true });
  for (const line of (pathMidl.stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) found.push(trimmed);
  }

  return [...new Set(found)].filter((candidate) => fs.existsSync(candidate));
}

function findMidl() {
  const candidates = collectMidlCandidates();
  // Prefer x64 Windows Kits MIDL when available.
  const preferred =
    candidates.find((candidate) => /\\bin\\[^\\]+\\x64\\midl\.exe$/i.test(candidate)) ||
    candidates[0];
  if (preferred) return preferred;
  throw new Error(
    "midl.exe not found. Install Visual Studio C++ build tools and a Windows 10/11 SDK (MIDL).",
  );
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
  console.log(`[decklink-sdk] Generating Windows headers with MIDL (${midl})`);
  // DeckLink IDL imports sibling IDL files only; no vcvars required for generation.
  // MIDL writes DeckLinkAPI.h / DeckLinkAPI_i.c into cwd.
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
