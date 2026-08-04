import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(workerRoot, "src");
const distRoot = path.join(workerRoot, "dist-local");
const localStub = path.join(sourceRoot, "cloud-client.local.js");

const FORBIDDEN_LOCAL_FILES = new Set(["supabase.js"]);

function copyJsTree(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (FORBIDDEN_LOCAL_FILES.has(entry.name)) {
      continue;
    }

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

if (!fs.existsSync(localStub)) {
  console.error(`Missing local cloud-client stub: ${localStub}`);
  process.exit(1);
}

fs.rmSync(distRoot, { recursive: true, force: true });
copyJsTree(sourceRoot, distRoot);
fs.copyFileSync(localStub, path.join(distRoot, "cloud-client.js"));

const marker = {
  name: "@neud/data-engine-local-worker",
  version: "0.1.0",
  private: true,
  type: "module",
  neudWorkerMode: "local",
  main: "index.js",
  dependencies: {
    dotenv: "^16.4.7",
    puppeteer: "^24.23.0",
  },
};

fs.writeFileSync(
  path.join(distRoot, "package.json"),
  `${JSON.stringify(marker, null, 2)}\n`,
  "utf8",
);

console.log(`Built local-only data-engine dist at ${distRoot}`);
