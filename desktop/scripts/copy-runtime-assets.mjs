import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { syncReleaseVersion } from "./sync-release-version.mjs";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");

function copyIfChanged(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) {
    return false;
  }
  if (fs.existsSync(toPath)) {
    const srcStat = fs.statSync(fromPath);
    const dstStat = fs.statSync(toPath);
    if (srcStat.size === dstStat.size && srcStat.mtimeMs <= dstStat.mtimeMs) {
      return false;
    }
  }
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.copyFileSync(fromPath, toPath);
  return true;
}

function copyMigrations() {
  const sourceDir = path.join(desktopRoot, "src", "database", "migrations");
  const targetDir = path.join(desktopRoot, "dist", "database", "migrations");

  if (!fs.existsSync(sourceDir)) {
    console.error(`Missing SQL migrations source directory: ${sourceDir}`);
    process.exit(1);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  for (const file of fs.readdirSync(sourceDir)) {
    if (file.endsWith(".sql")) {
      const fromPath = path.join(sourceDir, file);
      const toPath = path.join(targetDir, file);
      if (copyIfChanged(fromPath, toPath)) {
        copied += 1;
      }
    }
  }

  console.log(
    copied > 0
      ? `Copied SQL migrations to ${targetDir} (${copied} updated)`
      : `SQL migrations up to date at ${targetDir}`,
  );
}

function collectWasmCandidates() {
  const candidates = [];

  try {
    const sqlJsEntry = require.resolve("sql.js");
    const entryDir = path.dirname(sqlJsEntry);
    candidates.push(
      path.join(entryDir, "sql-wasm.wasm"),
      path.join(entryDir, "dist", "sql-wasm.wasm"),
      path.join(entryDir, "..", "dist", "sql-wasm.wasm"),
    );
  } catch {
    // Fall through to workspace candidates.
  }

  candidates.push(
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(desktopRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  );

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function findSqlWasmSource() {
  const candidates = collectWasmCandidates();

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  console.error("Could not find sql-wasm.wasm. Attempted:");
  for (const candidate of candidates) {
    console.error(`  - ${candidate}`);
  }
  process.exit(1);
}

function copySqlWasm() {
  const source = findSqlWasmSource();
  const targetDir = path.join(desktopRoot, "dist", "database", "assets");
  const target = path.join(targetDir, "sql-wasm.wasm");

  if (!copyIfChanged(source, target)) {
    console.log(`sql-wasm.wasm up to date at ${target}`);
    return;
  }

  console.log(`Copied sql-wasm.wasm from ${source}`);
  console.log(`Copied sql-wasm.wasm to ${target}`);
}

function validateDataEngineRuntimeAssets() {
  const requiredFiles = [
    path.join(repoRoot, "workers", "data-engine", "dist", "index.js"),
    path.join(repoRoot, "workers", "data-engine", "dist-local", "index.js"),
    path.join(
      repoRoot,
      "workers",
      "data-engine",
      "dist",
      "adapters",
      "bag-auction.js",
    ),
    path.join(
      repoRoot,
      "workers",
      "data-engine",
      "dist",
      "adapters",
      "bag-auction-legacy-runtime.js",
    ),
    path.join(
      repoRoot,
      "workers",
      "data-engine",
      "dist",
      "adapters",
      "bag-lot-detail-page.js",
    ),
    path.join(
      repoRoot,
      "workers",
      "data-engine",
      "dist",
      "browser",
      "resolve-puppeteer-browser.js",
    ),
    path.join(repoRoot, "workers", "data-engine", "dist", "engine-runtime.js"),
  ];

  const missing = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    console.error("Missing required data-engine runtime assets:");
    for (const filePath of missing) {
      console.error(`  - ${filePath}`);
    }
    process.exit(1);
  }

  console.log("Validated data-engine runtime assets");
}

function copyDisplayBridgeAssets() {
  const targetDir = path.join(desktopRoot, "dist", "displays");
  fs.mkdirSync(targetDir, { recursive: true });

  for (const filename of [
    "legacy-pylon-v2-bridge.js",
    "legacy-pylon-live-bridge.js",
    "legacy-ticker-v2-bridge.js",
    "legacy-ticker-live-bridge.js",
    "legacy-ticker-marquee.js",
    "stream-bid-v2-bridge.js",
    "stream-ticker-v2-bridge.js",
  ]) {
    const source = path.join(desktopRoot, "src", "displays", filename);
    fs.copyFileSync(source, path.join(targetDir, filename));
  }

  const bundledSourceDir = path.join(desktopRoot, "src", "displays", "bundled");
  const bundledTargetDir = path.join(targetDir, "bundled");
  fs.mkdirSync(bundledTargetDir, { recursive: true });
  for (const file of fs.readdirSync(bundledSourceDir)) {
    if (!file.endsWith(".html")) continue;
    fs.copyFileSync(path.join(bundledSourceDir, file), path.join(bundledTargetDir, file));
  }

  console.log(`Copied legacy display bridges and bundled HTML to ${targetDir}`);
}

function copyStreamTickerHostedLogoAssets() {
  const generatorScript = path.join(repoRoot, "scripts", "generate-stream-ticker-logo-data-uri.mjs");
  if (!fs.existsSync(generatorScript)) {
    console.error(`Missing Stream Ticker logo generator: ${generatorScript}`);
    process.exit(1);
  }

  const { execSync } = require("child_process");
  execSync(`node "${generatorScript}"`, { stdio: "inherit", cwd: repoRoot });

  const generatedSource = path.join(
    repoRoot,
    "shared",
    "display-runtime",
    "stream-ticker-logo-data-uri.generated.ts",
  );
  const generatedTarget = path.join(
    desktopRoot,
    "src",
    "displays",
    "stream-ticker-logo-data-uri.generated.ts",
  );
  const generatedJsSource = path.join(
    repoRoot,
    "shared",
    "display-runtime",
    "stream-ticker-logo-data-uri.generated.js",
  );
  const generatedJsTarget = path.join(
    desktopRoot,
    "src",
    "displays",
    "stream-ticker-logo-data-uri.generated.js",
  );

  if (!fs.existsSync(generatedSource)) {
    console.error(`Missing generated Stream Ticker logo data URI: ${generatedSource}`);
    process.exit(1);
  }

  fs.copyFileSync(generatedSource, generatedTarget);
  fs.copyFileSync(generatedJsSource, generatedJsTarget);
  console.log(`Copied Stream Ticker logo data URI to ${generatedTarget}`);
}

function validateStreamTickerLogoAsset() {
  const logoSource = path.join(repoRoot, "public", "displays", "pylon", "logo.png");
  const stagedLogo = path.join(repoRoot, "public", "displays", "pylon", "logo.png");

  if (!fs.existsSync(logoSource)) {
    console.error(`Missing Broad Arrow ticker logo asset: ${logoSource}`);
    process.exit(1);
  }

  const tickerHtml = path.join(desktopRoot, "src", "displays", "bundled", "stream-ticker-v1.html");
  const tickerContents = fs.readFileSync(tickerHtml, "utf8");
  if (!tickerContents.includes("/displays/pylon/logo.png")) {
    console.error("Stream Ticker HTML does not reference /displays/pylon/logo.png");
    process.exit(1);
  }

  console.log(`Validated Stream Ticker logo asset at ${stagedLogo}`);
}

function removeForbiddenDistArtifacts() {
  const forbiddenRelativePaths = [
    "services/supabase-main.js",
    "services/supabase-main.js.map",
  ];

  for (const relativePath of forbiddenRelativePaths) {
    const absolutePath = path.join(desktopRoot, "dist", relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { force: true });
      console.log(`Removed forbidden desktop dist artifact: ${relativePath}`);
    }
  }
}

function copyApplicationIcons() {
  const buildIcon = path.join(desktopRoot, "build", "icon.ico");
  const assetsIcon = path.join(desktopRoot, "assets", "icon.ico");
  const targetDir = path.join(desktopRoot, "dist", "assets");
  fs.mkdirSync(targetDir, { recursive: true });

  for (const source of [buildIcon, assetsIcon, path.join(desktopRoot, "assets", "icon.png")]) {
    if (!fs.existsSync(source)) {
      continue;
    }
    fs.copyFileSync(source, path.join(targetDir, path.basename(source)));
  }
}

function copyBootstrapEntry() {
  fs.copyFileSync(
    path.join(desktopRoot, "scripts", "bootstrap-main.cjs"),
    path.join(desktopRoot, "dist", "bootstrap.js"),
  );
}

function copyBagRuntimeConfig() {
  const source = path.join(repoRoot, "shared", "bag", "bag-runtime-config.json");
  const target = path.join(desktopRoot, "dist", "bag", "config", "bag-runtime-config.json");

  if (!fs.existsSync(source)) {
    console.error(`Missing BAG runtime config source: ${source}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Copied BAG runtime config to ${target}`);
}

function syncRuntimeAssets() {
  const { execSync } = require("child_process");
  execSync(`node "${path.join(__dirname, "sync-runtime-assets.mjs")}"`, {
    stdio: "inherit",
    cwd: desktopRoot,
  });
}

copyBootstrapEntry();
copyBagRuntimeConfig();
syncRuntimeAssets();
copyMigrations();
copySqlWasm();
copyDisplayBridgeAssets();
copyStreamTickerHostedLogoAssets();
validateStreamTickerLogoAsset();
validateDataEngineRuntimeAssets();
syncReleaseVersion();
removeForbiddenDistArtifacts();
copyApplicationIcons();
