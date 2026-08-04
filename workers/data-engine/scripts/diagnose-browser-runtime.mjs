/**
 * Browser-only diagnostic for Broad Arrow Puppeteer runtime resolution.
 *
 * Usage:
 *   cd workers/data-engine
 *   npm run browser:diagnose
 */
import {
  formatBrowserDiagnostics,
  resolveAndLaunchPuppeteerBrowser,
} from "../src/browser/resolve-puppeteer-browser.js";
import { loadBroadArrowPuppeteer } from "../src/adapters/legacy-puppeteer-resolver.js";

function yesNo(value) {
  if (value === true || value === "yes") return "yes";
  if (value === false || value === "no") return "no";
  return "unknown";
}

async function main() {
  const { puppeteer, runtimeInfo } = await loadBroadArrowPuppeteer({
    skipReferenceBrowserProbe: true,
  });

  const resolved = await resolveAndLaunchPuppeteerBrowser({
    puppeteerModule: puppeteer.default ?? puppeteer,
    puppeteerPackagePath: runtimeInfo.puppeteerPackagePath,
    puppeteerPackageVersion: runtimeInfo.puppeteerPackageVersion,
    launchOptions: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: { width: 1366, height: 900 },
    },
  });

  const diagnostics = formatBrowserDiagnostics(resolved.diagnostics);

  console.log("=== Broad Arrow Browser Diagnostic ===");
  console.log(`Puppeteer resolved package path: ${runtimeInfo.puppeteerPackagePath ?? "unknown"}`);
  console.log(`Puppeteer version: ${runtimeInfo.puppeteerPackageVersion ?? "unknown"}`);
  console.log(`PUPPETEER_CACHE_DIR set: ${diagnostics.puppeteerCacheDirSet}`);
  if (diagnostics.puppeteerCacheDir) {
    console.log(`PUPPETEER_CACHE_DIR: ${diagnostics.puppeteerCacheDir}`);
  }
  console.log(`Puppeteer executablePath result: ${diagnostics.puppeteerExecutablePathResult ?? "none"}`);
  console.log(`Executable exists: ${yesNo(diagnostics.resolvedExecutableExists)}`);
  console.log(`Selected executable source: ${diagnostics.resolvedBrowserSource ?? "unknown"}`);
  console.log(`Selected executable path: ${diagnostics.resolvedExecutablePath ?? "none"}`);
  console.log(`Browser launch succeeded: ${yesNo(diagnostics.browserLaunchSucceeded)}`);
  console.log(`Browser version: ${diagnostics.browserVersion ?? "unknown"}`);
  if (diagnostics.rejectedMissingConfiguredExecutable) {
    console.log(
      `Rejected missing configured executable: ${diagnostics.rejectedMissingConfiguredExecutable}`,
    );
  }

  if (diagnostics.resolvedExecutableExists !== "yes" || diagnostics.browserLaunchSucceeded !== "yes") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
