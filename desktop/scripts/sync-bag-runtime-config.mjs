#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = path.join(repoRoot, "shared", "bag", "bag-runtime-config.json");
const targets = [
  path.join(repoRoot, "desktop", "src", "bag", "config", "bag-runtime-config.json"),
  path.join(repoRoot, "desktop", "dist", "bag", "config", "bag-runtime-config.json"),
];

if (!fs.existsSync(source)) {
  console.error(`Missing canonical BAG runtime config: ${source}`);
  process.exit(1);
}

const contents = fs.readFileSync(source, "utf8");

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}

console.log(`Synced BAG runtime config from ${source}`);
