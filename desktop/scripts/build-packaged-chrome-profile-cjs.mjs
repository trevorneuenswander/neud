import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const sourceJs = path.join(repoRoot, "shared", "browser", "packaged-chrome-profile.js");
const targetJs = path.join(desktopRoot, "dist", "lib", "browser", "packaged-chrome-profile.js");
const tsconfigPath = path.join(desktopRoot, "tsconfig.packaged-chrome-profile.json");

if (!fs.existsSync(sourceJs)) {
  console.error(`Missing canonical packaged Chrome profile: ${sourceJs}`);
  process.exit(1);
}

execSync(`npx tsc -p "${tsconfigPath}"`, {
  cwd: desktopRoot,
  stdio: "inherit",
});

if (!fs.existsSync(targetJs)) {
  console.error(`Expected CommonJS profile module at ${targetJs}`);
  process.exit(1);
}

const emitted = fs.readFileSync(targetJs, "utf8");
if (/^\s*import\s/m.test(emitted) || /^\s*export\s/m.test(emitted)) {
  console.error(
    `Desktop packaged Chrome profile must be CommonJS-compatible; found ESM syntax in ${targetJs}`,
  );
  process.exit(1);
}
if (!/exports\.resolvePackagingProfileForPackagedRuntime/.test(emitted)) {
  console.error(`Desktop packaged Chrome profile is missing expected CommonJS exports in ${targetJs}`);
  process.exit(1);
}

console.log(`Built CommonJS packaged Chrome profile at ${targetJs}`);
