import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerRoot = path.join(repoRoot, "workers", "data-engine");

test("legacy puppeteer resolver uses createRequire in ESM context", async () => {
  const moduleUrl = pathToFileURL(
    path.join(workerRoot, "src/adapters/legacy-puppeteer-resolver.js"),
  ).href;
  const { resolvePuppeteerPackagePath } = await import(moduleUrl);
  const packagePath = resolvePuppeteerPackagePath(workerRoot);
  assert.match(packagePath.replace(/\\/g, "/"), /puppeteer\/package\.json$/);
});
