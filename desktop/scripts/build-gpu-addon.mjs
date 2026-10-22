import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeGypSpawnOptions, resolveNodeGyp } from "./lib/resolve-node-gyp.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = path.join(desktopRoot, "native", "gpu");
const built = path.join(nativeDir, "build", "Release", "neud_gpu.node");
const platformDir =
  process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : "linux";
const destination = path.join(desktopRoot, "dist", "platform", platformDir, "neud_gpu.node");

const arch =
  process.platform === "darwin"
    ? "arm64"
    : process.platform === "win32"
      ? "x64"
      : process.arch;

const force = process.argv.includes("--force") || process.env.NEUD_FORCE_NATIVE_REBUILD === "1";

function sourceMtimeMs() {
  const sources = [
    path.join(nativeDir, "binding.gyp"),
    path.join(nativeDir, "gpu-addon.cc"),
    path.join(nativeDir, "gpu-mac.mm"),
    path.join(nativeDir, "gpu-win.cpp"),
    path.join(nativeDir, "gpu-stub.cpp"),
    path.join(nativeDir, "gpu.h"),
  ];
  let newest = 0;
  for (const file of sources) {
    if (!fs.existsSync(file)) continue;
    newest = Math.max(newest, fs.statSync(file).mtimeMs);
  }
  return newest;
}

function isUpToDate() {
  if (!fs.existsSync(built) || !fs.existsSync(destination)) return false;
  const newestSource = sourceMtimeMs();
  const builtMtime = fs.statSync(built).mtimeMs;
  const destMtime = fs.statSync(destination).mtimeMs;
  return builtMtime >= newestSource && destMtime >= builtMtime;
}

if (!force && isUpToDate()) {
  console.log(`GPU addon up to date at ${destination}`);
  process.exit(0);
}

const nodeGyp = resolveNodeGyp(desktopRoot);
const spawnOpts = nodeGypSpawnOptions(nodeGyp);
console.log("[native] node-gyp:", nodeGyp);
const result = spawnSync(
  spawnOpts.command,
  [
    ...spawnOpts.argsPrefix,
    "rebuild",
    "--release",
    "--target=33.4.11",
    `--arch=${arch}`,
    "--dist-url=https://electronjs.org/headers",
  ],
  {
    cwd: nativeDir,
    stdio: "inherit",
    shell: spawnOpts.shell,
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: "33.4.11",
      npm_config_arch: arch,
      npm_config_target_arch: arch,
      npm_config_disturl: "https://electronjs.org/headers",
      npm_config_build_from_source: "true",
    },
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
if (!fs.existsSync(built)) {
  console.error(`Missing GPU addon: ${built}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(built, destination);

// Freshly linked .node bundles can be rejected by macOS until ad-hoc resigned.
if (process.platform === "darwin") {
  for (const candidate of [built, destination]) {
    const signed = spawnSync("codesign", ["--force", "--sign", "-", candidate], {
      encoding: "utf8",
    });
    if (signed.status !== 0) {
      console.warn(
        `codesign warning for ${candidate}: ${signed.stderr || signed.stdout || "failed"}`,
      );
    }
  }
}

console.log(`Copied GPU addon to ${destination}`);
