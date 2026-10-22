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
  const candidates = [
    path.join(root, "Mac", "include"),
    path.join(root, "Win", "include"),
    root,
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "DeckLinkAPI.h"))) || "";
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

export function buildDeckLinkAddon(options = {}) {
  const includeDir = resolveDeckLinkIncludeDir(options.sdkRoot ?? sdkRoot);
  const staged = stageDeckLinkInclude(includeDir, options.stageDir ?? stagedInclude);
  const hasSdk = Boolean(staged);
  const forceStub = options.forceStub === true;
  const targetArch = options.arch ?? arch;

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

  const dispatchSource = path.join(staged || "", "DeckLinkAPIDispatch.cpp");
  const localDispatch = path.join(nativeDir, "DeckLinkAPIDispatch.cpp");

  if (hasSdk && fs.existsSync(dispatchSource)) {
    fs.copyFileSync(dispatchSource, localDispatch);
  } else if (fs.existsSync(localDispatch) && !hasSdk) {
    fs.rmSync(localDispatch, { force: true });
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
  writeAddonMeta({
    stub: !hasSdk,
    electronTarget: ELECTRON_TARGET,
    arch: targetArch,
    builtAt: new Date().toISOString(),
    sdkRoot: hasSdk ? path.resolve(options.sdkRoot ?? sdkRoot) : null,
  });
  return { ok: true, status: 0, hasSdk, staged, destination, preserved: false };
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
