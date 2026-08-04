import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const PUPPETEER_SEARCH_ROOTS = [
  { label: "repository-root", dir: repoRoot },
  { label: "data-engine-worker", dir: path.join(repoRoot, "workers", "data-engine") },
  { label: "desktop-workspace", dir: path.join(repoRoot, "desktop") },
];

function readPackageVersion(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version ?? "unknown";
}

async function importPuppeteerFromDir(fromDir) {
  const packageJsonPath = require.resolve("puppeteer/package.json", { paths: [fromDir] });
  const packageDir = path.dirname(packageJsonPath);
  const entryPath = path.join(packageDir, "lib/esm/puppeteer/puppeteer.js");
  const module = await import(pathToFileURL(entryPath).href);
  return {
    module,
    packageJsonPath,
    packageVersion: readPackageVersion(packageJsonPath),
    root: fromDir,
  };
}

async function loadPuppeteerResolver() {
  const candidates = [
    path.join(repoRoot, "workers", "data-engine", "dist", "browser", "resolve-puppeteer-browser.js"),
    path.join(repoRoot, "workers", "data-engine", "src", "browser", "resolve-puppeteer-browser.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }

  throw new Error(
    "Unable to locate resolve-puppeteer-browser.js in workers/data-engine (dist or src).",
  );
}

/**
 * Resolve Puppeteer and a launchable Chrome executable using the same order as
 * the Broad Arrow data-engine worker, with explicit diagnostics on failure.
 */
export async function loadValidationPuppeteer(options = {}) {
  const checked = [];
  let selected = null;

  for (const candidate of PUPPETEER_SEARCH_ROOTS) {
    try {
      selected = await importPuppeteerFromDir(candidate.dir);
      checked.push({
        label: candidate.label,
        dir: candidate.dir,
        packageJsonPath: selected.packageJsonPath,
        packageVersion: selected.packageVersion,
        found: true,
      });
      break;
    } catch (error) {
      checked.push({
        label: candidate.label,
        dir: candidate.dir,
        found: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!selected) {
    const message = [
      "Unable to resolve a Puppeteer package for stream display validation.",
      "Checked:",
      ...checked.map((entry) =>
        entry.found
          ? `  - ${entry.label}: ${entry.packageJsonPath}`
          : `  - ${entry.label}: not found (${entry.error ?? "missing"})`,
      ),
      "Install Puppeteer with `npm install` in workers/data-engine or run `npm run browser:install -w @neud/data-engine-worker`.",
    ].join("\n");
    const error = new Error(message);
    error.checkedPaths = checked;
    throw error;
  }

  const resolver = await loadPuppeteerResolver();
  resolver.normalizePuppeteerEnvironment();

  let resolved;
  try {
    resolved = await resolver.resolvePuppeteerBrowser({
      puppeteerModule: selected.module,
      puppeteerRoot: selected.root,
      configuredExecutablePath: options.executablePath ?? null,
    });
  } catch (error) {
    const diagnostics =
      error?.diagnostics != null ? JSON.stringify(error.diagnostics, null, 2) : null;
    const message = [
      error instanceof Error ? error.message : String(error),
      "",
      "Puppeteer package:",
      `  ${selected.packageJsonPath} (${selected.packageVersion})`,
      "",
      "Resolution order attempted:",
      "  1. Repository Puppeteer dependency",
      "  2. Data-engine worker Puppeteer dependency",
      "  3. Configured Chrome executable path (PUPPETEER_EXECUTABLE_PATH / CHROME_EXECUTABLE_PATH)",
      "  4. Puppeteer-managed browser cache",
      "  5. Installed system Chrome",
      "  6. Installed system Edge",
      diagnostics ? `\nDiagnostics:\n${diagnostics}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const wrapped = new Error(message);
    wrapped.checkedPaths = checked;
    wrapped.cause = error;
    throw wrapped;
  }

  const puppeteer = resolver.getPuppeteerApi(selected.module);
  const launchOptions = resolver.buildPuppeteerLaunchOptions(resolved, {
    headless: options.headless ?? true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      ...(options.args ?? []),
    ],
    defaultViewport: { width: 3840, height: 2160, deviceScaleFactor: 1 },
  });

  return {
    puppeteer,
    launchOptions,
    executablePath: resolved.executablePath ?? null,
    browserSource: resolved.source ?? null,
    puppeteerPackagePath: selected.packageJsonPath,
    puppeteerPackageVersion: selected.packageVersion,
    checkedPaths: checked,
  };
}

export function toFileUrl(absolutePath) {
  const normalized = path.resolve(absolutePath).replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}
