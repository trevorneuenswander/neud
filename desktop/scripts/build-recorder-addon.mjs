import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = path.join(desktopRoot, "native", "recorder");
const built = path.join(nativeDir, "build", "Release", "neud_recorder.node");
const platformDir =
  process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : "linux";
const destination = path.join(desktopRoot, "dist", "platform", platformDir, "neud_recorder.node");

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
    path.join(nativeDir, "recorder-addon.cc"),
    path.join(nativeDir, "recorder-mac.mm"),
    path.join(nativeDir, "recorder-win.cpp"),
    path.join(nativeDir, "recorder-stub.cpp"),
    path.join(nativeDir, "recorder.h"),
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
  console.log(`Recorder addon up to date at ${destination}`);
  process.exit(0);
}

const nodeGyp = path.join(desktopRoot, "node_modules", ".bin", "node-gyp");
const result = spawnSync(
  nodeGyp,
  [
    "rebuild",
    "--release",
    "--target=33.4.11",
    `--arch=${arch}`,
    "--dist-url=https://electronjs.org/headers",
  ],
  {
    cwd: nativeDir,
    stdio: "inherit",
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
  console.error(`Missing recorder addon: ${built}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(built, destination);
console.log(`Copied recorder addon to ${destination}`);
