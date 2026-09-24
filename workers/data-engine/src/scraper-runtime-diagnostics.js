const diagnostics = {
  scraperRuntimeKind: "data-engine-worker",
  workerModuleFormat: "esm",
  failingModuleBeforeFix: "legacy-puppeteer-resolver.js",
  requireReferenceCount: 0,
  requireInBrowserContext: false,
  workerStarted: false,
  firstScraperRuntimeFailureStage: "none",
};

export function getScraperRuntimeDiagnostics() {
  return { ...diagnostics };
}

export function markWorkerStarted() {
  diagnostics.workerStarted = true;
}

export function recordScraperRuntimeFailureStage(stage) {
  if (diagnostics.firstScraperRuntimeFailureStage === "none" && stage && stage !== "none") {
    diagnostics.firstScraperRuntimeFailureStage = stage;
  }
}

export function auditWorkerModuleForRequire(source, context) {
  const matches = source.match(/\brequire\s*\(/g);
  const count = matches?.length ?? 0;
  diagnostics.requireReferenceCount += count;
  if (count > 0 && context === "browser_context") {
    diagnostics.requireInBrowserContext = true;
    recordScraperRuntimeFailureStage("browser_context_commonjs_call");
  }
  if (count > 0 && context === "worker_esm") {
    recordScraperRuntimeFailureStage("esm_commonjs_mismatch");
  }
}
