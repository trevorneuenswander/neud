import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeGypSpawnOptions, resolveNodeGyp } from "./lib/resolve-node-gyp.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = path.join(desktopRoot, "native", "decklink");
const built = path.join(nativeDir, "build", "Release", "neud_decklink.node");
const destination = path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.node");
const metaPath = path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.meta.json");
const stagedInclude = path.join(nativeDir, ".sdk-include");
const arch = process.platform === "darwin" ? "arm64" : "x64";
const ELECTRON_TARGET = "33.4.11";

function defaultSdkRoot() {
  if (process.env.NEUD_DECKLINK_SDK) {
    return process.env.NEUD_DECKLINK_SDK;
  }
  // Dev convenience: honor the conventional home SDK location without requiring
  // every Terminal session to export NEUD_DECKLINK_SDK.
  const homeSdk = path.join(os.homedir(), "DeckLinkSDK");
  return fs.existsSync(homeSdk) ? homeSdk : "";
}

const sdkRoot = defaultSdkRoot();

export function resolveDeckLinkIncludeDir(root = sdkRoot) {
  if (!root) return "";
  const platformCandidates =
    process.platform === "win32"
      ? [path.join(root, "Win", "include"), path.join(root, "Mac", "include"), root]
      : process.platform === "darwin"
        ? [path.join(root, "Mac", "include"), path.join(root, "Win", "include"), root]
        : [path.join(root, "Linux", "include"), path.join(root, "Win", "include"), root];
  return (
    platformCandidates.find(
      (candidate) =>
        fs.existsSync(path.join(candidate, "DeckLinkAPI.h")) ||
        fs.existsSync(path.join(candidate, "DeckLinkAPI.idl")),
    ) || ""
  );
}

function findMidlExecutable() {
  const found = [];
  const fromEnv = process.env.NEUD_MIDL_PATH?.trim();
  if (fromEnv) found.push(fromEnv);

  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  for (const kitsRoot of [
    path.join(programFilesX86, "Windows Kits", "10", "bin"),
    path.join(programFiles, "Windows Kits", "10", "bin"),
  ]) {
    if (!fs.existsSync(kitsRoot)) continue;
    for (const versionDir of fs.readdirSync(kitsRoot)) {
      for (const arch of ["x64", "x86"]) {
        found.push(path.join(kitsRoot, versionDir, arch, "midl.exe"));
      }
    }
  }

  const vswhere = path.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (fs.existsSync(vswhere)) {
    const result = spawnSync(vswhere, ["-latest", "-products", "*", "-find", "**/midl.exe"], {
      encoding: "utf8",
    });
    for (const line of (result.stdout || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) found.push(trimmed);
    }
  }

  const existing = [...new Set(found)].filter((candidate) => fs.existsSync(candidate));
  return (
    existing.find((candidate) => /\\bin\\[^\\]+\\x64\\midl\.exe$/i.test(candidate)) ||
    existing[0] ||
    ""
  );
}

/** Windows SDK 16 ships IDL only — generate DeckLinkAPI.h / DeckLinkAPI_i.c via MIDL. */
export function ensureWindowsDeckLinkHeaders(includeDir) {
  if (!includeDir) return { ok: false, error: "Missing include dir" };
  const header = path.join(includeDir, "DeckLinkAPI.h");
  const iid = path.join(includeDir, "DeckLinkAPI_i.c");
  if (fs.existsSync(header) && fs.existsSync(iid)) {
    return { ok: true, generated: false };
  }
  if (!fs.existsSync(path.join(includeDir, "DeckLinkAPI.idl"))) {
    return { ok: false, error: `DeckLinkAPI.idl missing in ${includeDir}` };
  }
  if (process.platform !== "win32") {
    return {
      ok: false,
      error: "Windows DeckLink headers require MIDL on win32 (IDL-only SDK tree).",
    };
  }
  const midl = findMidlExecutable();
  if (!midl) {
    return { ok: false, error: "midl.exe not found (Visual Studio C++ / MIDL required)." };
  }
  console.log(`[decklink] Generating Windows headers with MIDL`);
  const result = spawnSync(
    midl,
    [
      "/W1",
      "/robust",
      "/nologo",
      `/I${includeDir}`,
      "/h",
      "DeckLinkAPI.h",
      "/iid",
      "DeckLinkAPI_i.c",
      "DeckLinkAPI.idl",
    ],
    { cwd: includeDir, encoding: "utf8" },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      error: `MIDL failed: ${(result.stderr || result.stdout || "").trim() || "unknown error"}`,
    };
  }
  if (!fs.existsSync(header) || !fs.existsSync(iid)) {
    return { ok: false, error: "MIDL completed but DeckLinkAPI.h / DeckLinkAPI_i.c were not produced." };
  }
  return { ok: true, generated: true };
}

export function stageDeckLinkInclude(includeDir, stageDir = stagedInclude) {
  if (!includeDir) {
    fs.rmSync(stageDir, { recursive: true, force: true });
    return "";
  }
  const resolved = path.resolve(includeDir);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(stageDir), { recursive: true });
  fs.symlinkSync(resolved, stageDir, "dir");
  return stageDir;
}

function readAddonMeta(filePath = metaPath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeAddonMeta(meta, filePath = metaPath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

/** True when an on-disk addon looks like a real (non-stub) DeckLink build. */
export function isRealDeckLinkAddonBinary(filePath = destination) {
  if (!fs.existsSync(filePath)) return false;
  const meta = readAddonMeta();
  if (meta && meta.stub === false && meta.electronTarget === ELECTRON_TARGET) {
    return true;
  }
  try {
    const buf = fs.readFileSync(filePath);
    // Stub metrics/adapter JSON embeds "stub":true; real SDK builds do not.
    return !buf.includes(Buffer.from('"stub":true'));
  } catch {
    return false;
  }
}

/**
 * When true (NEUD_REQUIRE_REAL_DECKLINK=1 or options.requireReal), refuse stub builds.
 * Windows release packaging must set this so installers never ship a DeckLink stub.
 */
export function requireRealDeckLinkAddon(options = {}) {
  return (
    options.requireReal === true ||
    process.env.NEUD_REQUIRE_REAL_DECKLINK === "1" ||
    process.env.NEUD_REQUIRE_REAL_DECKLINK === "true"
  );
}

export function buildDeckLinkAddon(options = {}) {
  const includeDir = resolveDeckLinkIncludeDir(options.sdkRoot ?? sdkRoot);
  const staged = stageDeckLinkInclude(includeDir, options.stageDir ?? stagedInclude);
  const hasSdk = Boolean(staged);
  const forceStub = options.forceStub === true;
  const requireReal = requireRealDeckLinkAddon(options);
  const targetArch = options.arch ?? arch;

  if (requireReal && forceStub) {
    return {
      ok: false,
      status: 1,
      hasSdk,
      error:
        "NEUD_REQUIRE_REAL_DECKLINK=1 cannot be combined with a forced DeckLink stub build.",
    };
  }

  if (requireReal && !hasSdk) {
    return {
      ok: false,
      status: 1,
      hasSdk: false,
      error:
        "DeckLink SDK not found. Set NEUD_DECKLINK_SDK to the Blackmagic DeckLink SDK root " +
        "(must contain Win/include/DeckLinkAPI.idl or Mac/include/DeckLinkAPI.h). " +
        "Windows release packaging refuses stub DeckLink addons.",
    };
  }

  // Ordinary desktop builds without SDK must not destroy a previously built real addon
  // for the same Electron ABI (Pass 8 regression: stub overwrite → UltraStudio unavailable).
  if (!hasSdk && !forceStub && isRealDeckLinkAddonBinary(destination)) {
    const meta = readAddonMeta() ?? {
      stub: false,
      electronTarget: ELECTRON_TARGET,
      arch: targetArch,
      preserved: true,
    };
    console.log(
      `[decklink] Preserving existing real addon at ${destination} (NEUD_DECKLINK_SDK unset; Electron ${ELECTRON_TARGET})`,
    );
    writeAddonMeta({ ...meta, stub: false, electronTarget: ELECTRON_TARGET, arch: targetArch, preserved: true });
    return { ok: true, status: 0, hasSdk: false, preserved: true, destination };
  }

  if (hasSdk && process.platform === "win32") {
    const ensured = ensureWindowsDeckLinkHeaders(includeDir);
    if (!ensured.ok) {
      return { ok: false, status: 1, hasSdk, error: ensured.error };
    }
  }

  const dispatchSource = path.join(staged || "", "DeckLinkAPIDispatch.cpp");
  const localDispatch = path.join(nativeDir, "DeckLinkAPIDispatch.cpp");
  const localIid = path.join(nativeDir, "DeckLinkAPI_i.c");
  const sdkIid = path.join(includeDir || "", "DeckLinkAPI_i.c");

  if (hasSdk && process.platform === "darwin" && fs.existsSync(dispatchSource)) {
    fs.copyFileSync(dispatchSource, localDispatch);
  } else if (fs.existsSync(localDispatch)) {
    fs.rmSync(localDispatch, { force: true });
  }

  if (hasSdk && process.platform === "win32" && fs.existsSync(sdkIid)) {
    fs.copyFileSync(sdkIid, localIid);
  } else if (fs.existsSync(localIid) && !(hasSdk && process.platform === "win32")) {
    fs.rmSync(localIid, { force: true });
  }

  const nodeGyp = resolveNodeGyp(desktopRoot);
  const spawnOpts = nodeGypSpawnOptions(nodeGyp);
  const args = [
    ...spawnOpts.argsPrefix,
    "rebuild",
    "--release",
    `--target=${ELECTRON_TARGET}`,
    `--arch=${targetArch}`,
    "--dist-url=https://electronjs.org/headers",
    `--NEUD_DECKLINK_SDK=${hasSdk ? "1" : "0"}`,
    `--decklink_include=${staged || "."}`,
  ];

  console.log(`[decklink] node-gyp: ${nodeGyp}`);
  const result = spawnSync(spawnOpts.command, args, {
    cwd: nativeDir,
    stdio: "inherit",
    shell: spawnOpts.shell,
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: ELECTRON_TARGET,
      npm_config_arch: targetArch,
      npm_config_target_arch: targetArch,
      npm_config_disturl: "https://electronjs.org/headers",
      NEUD_DECKLINK_INCLUDE: staged || "",
    },
  });

  if (result.error) {
    console.error(`[decklink] node-gyp spawn failed: ${result.error.message}`);
    return { ok: false, status: 1, hasSdk, staged, error: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, status: result.status ?? 1, hasSdk, staged };
  }
  if (!fs.existsSync(built)) {
    return { ok: false, status: 1, hasSdk, staged, error: `Missing DeckLink addon: ${built}` };
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(built, destination);
  const stub = !hasSdk;
  writeAddonMeta({
    stub,
    electronTarget: ELECTRON_TARGET,
    arch: targetArch,
    builtAt: new Date().toISOString(),
    sdkRoot: hasSdk ? path.resolve(options.sdkRoot ?? sdkRoot) : null,
  });
  if (requireReal && stub) {
    return {
      ok: false,
      status: 1,
      hasSdk,
      staged,
      destination,
      error: "DeckLink addon built as stub despite NEUD_REQUIRE_REAL_DECKLINK=1.",
    };
  }
  if (requireReal && !isRealDeckLinkAddonBinary(destination)) {
    return {
      ok: false,
      status: 1,
      hasSdk,
      staged,
      destination,
      error: "DeckLink addon failed real-binary verification after build.",
    };
  }
  return { ok: true, status: 0, hasSdk, staged, destination, preserved: false, stub };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildDeckLinkAddon();
  if (!result.ok) {
    if (result.error) console.error(result.error);
    process.exit(result.status);
  }
  if (result.preserved) {
    console.log(`Preserved real DeckLink addon at ${result.destination}`);
  } else {
    console.log(
      `Copied DeckLink addon to ${result.destination} (${result.hasSdk ? `real SDK via ${result.staged}` : "stub"})`,
    );
  }
}
