import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourceJs = path.join(repoRoot, "shared", "browser", "packaged-chrome-profile.js");
const sourceDts = path.join(repoRoot, "shared", "browser", "packaged-chrome-profile.d.ts");
const jsTargets = [
  path.join(repoRoot, "workers", "data-engine", "src", "browser", "packaged-chrome-profile.js"),
  path.join(repoRoot, "workers", "data-engine", "dist", "browser", "packaged-chrome-profile.js"),
  path.join(repoRoot, "workers", "data-engine", "dist-local", "browser", "packaged-chrome-profile.js"),
  path.join(repoRoot, "desktop", "src", "lib", "browser", "packaged-chrome-profile.js"),
];
const dtsTargets = [
  path.join(repoRoot, "desktop", "src", "lib", "browser", "packaged-chrome-profile.d.ts"),
];

if (!fs.existsSync(sourceJs)) {
  console.error(`Missing ${sourceJs}`);
  process.exit(1);
}

const jsContents = fs.readFileSync(sourceJs, "utf8");
for (const target of jsTargets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, jsContents, "utf8");
}

if (fs.existsSync(sourceDts)) {
  const dtsContents = fs.readFileSync(sourceDts, "utf8");
  for (const target of dtsTargets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, dtsContents, "utf8");
  }
}

console.log(
  `Synced packaged Chrome profile to ${jsTargets.length} runtime locations (${dtsTargets.length} desktop type stubs)`,
);
