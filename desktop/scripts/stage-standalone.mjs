import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "node:child_process";
import { stagePackagedBrowser } from "./stage-packaged-browser.mjs";
import { stageWorkerProductionNodeModules } from "../../workers/data-engine/scripts/worker-production-deps.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const stagingRoot = path.join(repoRoot, "desktop", "staging");
const localWorkerDist = path.join(repoRoot, "workers", "data-engine", "dist-local");
const remoteWorkerRoot = path.join(repoRoot, "workers", "data-engine");

const copies = [
  {
    from: path.join(repoRoot, ".next", "standalone"),
    to: path.join(stagingRoot, "next"),
  },
  {
    from: path.join(repoRoot, ".next", "static"),
    to: path.join(stagingRoot, "next", ".next", "static"),
  },
  {
    from: path.join(repoRoot, "public"),
    to: path.join(stagingRoot, "next", "public"),
  },
  {
    from: path.join(repoRoot, "shared", "bag"),
    to: path.join(stagingRoot, "shared", "bag"),
  },
  {
    from: path.join(repoRoot, "desktop", "src", "displays", "bundled"),
    to: path.join(stagingRoot, "displays", "bundled"),
  },
];

const SKIP_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.live-validation.local",
  ".env.example",
  "supabase.js",
]);

// Only skip scraper session directories during Next.js standalone copies (Next ships
// compiled modules such as next/dist/compiled/@edge-runtime/cookies).
const WORKER_SKIP_NAMES = new Set(["cookies"]);

const SKIP_EXTENSIONS = new Set([".cred", ".log"]);

function shouldSkipEntry(name, context = "global") {
  if (SKIP_NAMES.has(name)) return true;
  if (context === "worker" && WORKER_SKIP_NAMES.has(name)) return true;
  for (const ext of SKIP_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

function copyRecursive(source, destination, context = "global") {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing staging source: ${source}`);
  }

  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (shouldSkipEntry(entry.name, context)) {
      continue;
    }

    const fromPath = path.join(source, entry.name);
    const toPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(fromPath, toPath, context);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

function stageProductionWorkerNodeModules(destinationRoot) {
  const staged = stageWorkerProductionNodeModules({
    stagingWorkerRoot: destinationRoot,
  });
  console.log(
    `Staged ${staged.packageCount} production worker packages at ${staged.modulesRoot}`,
  );
}

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function ensureLocalWorkerDist() {
  if (!fs.existsSync(path.join(localWorkerDist, "index.js"))) {
    execSync("npm run build:local", {
      cwd: remoteWorkerRoot,
      stdio: "inherit",
    });
  }
}

function stageLocalWorker() {
  ensureLocalWorkerDist();
  const workerStageRoot = path.join(stagingRoot, "worker");
  const workerDistTarget = path.join(workerStageRoot, "dist");
  removeIfExists(workerStageRoot);
  fs.mkdirSync(workerDistTarget, { recursive: true });
  copyRecursive(localWorkerDist, workerDistTarget);

  if (fs.existsSync(path.join(workerDistTarget, "supabase.js"))) {
    throw new Error("Local worker staging must not include supabase.js");
  }

  stageProductionWorkerNodeModules(workerStageRoot);
  fs.writeFileSync(
    path.join(workerStageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "@neud/data-engine-local-worker",
        version: "0.1.0",
        private: true,
        type: "module",
        neudWorkerMode: "local",
        main: "dist/index.js",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

removeIfExists(stagingRoot);
fs.mkdirSync(stagingRoot, { recursive: true });

for (const copy of copies) {
  copyRecursive(copy.from, copy.to);
}

stageLocalWorker();

const browserStage = stagePackagedBrowser();
console.log(
  `Staged Chrome for Testing ${browserStage.expectedBuildId} at ${browserStage.stagingBrowserRoot}`,
);

execSync(`node "${path.join(__dirname, "sync-runtime-assets.mjs")}"`, {
  cwd: path.join(repoRoot, "desktop"),
  stdio: "inherit",
});

execSync(`node "${path.join(__dirname, "generate-cloud-runtime-config.mjs")}"`, {
  cwd: path.join(repoRoot, "desktop"),
  stdio: "inherit",
});

console.log(`Staged desktop resources at ${stagingRoot}`);
