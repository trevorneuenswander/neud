import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = path.join(repoRoot, "shared", "browser", "packaged-chrome-profile.js");
const targets = [
  path.join(repoRoot, "workers", "data-engine", "src", "browser", "packaged-chrome-profile.js"),
  path.join(repoRoot, "workers", "data-engine", "dist", "browser", "packaged-chrome-profile.js"),
  path.join(repoRoot, "workers", "data-engine", "dist-local", "browser", "packaged-chrome-profile.js"),
];

if (!fs.existsSync(source)) {
  console.error(`Missing ${source}`);
  process.exit(1);
}

const contents = fs.readFileSync(source, "utf8");
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}

console.log(`Synced packaged Chrome profile to ${targets.length} worker locations`);
