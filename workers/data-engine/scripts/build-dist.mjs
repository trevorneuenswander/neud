import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(workerRoot, "src");
const distRoot = path.join(workerRoot, "dist");

function copyJsTree(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const fromPath = path.join(sourceDir, entry.name);
    const toPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyJsTree(fromPath, toPath);
      continue;
    }
    if (entry.name.endsWith(".js")) {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`Missing data-engine source directory: ${sourceRoot}`);
  process.exit(1);
}

fs.rmSync(distRoot, { recursive: true, force: true });
copyJsTree(sourceRoot, distRoot);
console.log(`Built data-engine dist at ${distRoot}`);
