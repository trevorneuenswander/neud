import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = path.join(desktopRoot, "native", "mac-output");
const built = path.join(nativeDir, "build", "Release", "neud_mac_output.node");
const destination = path.join(desktopRoot, "dist", "platform", "macos", "neud_mac_output.node");

if (process.platform !== "darwin") {
  console.log(`Skipping mac output addon build on ${process.platform}`);
  process.exit(0);
}

const nodeGyp = path.join(desktopRoot, "node_modules", ".bin", "node-gyp");
const result = spawnSync(
  nodeGyp,
  [
    "rebuild",
    "--release",
    "--target=33.4.11",
    "--arch=arm64",
    "--dist-url=https://electronjs.org/headers",
  ],
  {
    cwd: nativeDir,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: "33.4.11",
      npm_config_arch: "arm64",
      npm_config_target_arch: "arm64",
      npm_config_disturl: "https://electronjs.org/headers",
      npm_config_build_from_source: "true",
    },
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
if (!fs.existsSync(built)) {
  console.error(`Missing mac output addon: ${built}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(built, destination);
console.log(`Copied mac output addon to ${destination}`);
