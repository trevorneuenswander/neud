const fs = require("fs");
const path = require("path");

function traceBootstrap(message, metadata = {}) {
  const entry = {
    at: new Date().toISOString(),
    message,
    execPath: process.execPath,
    execBase: path.basename(process.execPath),
    appData: process.env.APPDATA ?? null,
    ...metadata,
  };

  for (const logPath of [
    path.join(process.env.APPDATA ?? "", "NEUD", "logs", "bootstrap.log"),
    path.join(process.env.TEMP ?? "", "neud-bootstrap.log"),
  ]) {
    if (!logPath || logPath.includes("undefined")) {
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      // ignore bootstrap logging failures
    }
  }
}

traceBootstrap("bootstrap.before_main_require");

try {
  require("./main.js");
  traceBootstrap("bootstrap.main_require_complete");
} catch (error) {
  traceBootstrap("bootstrap.main_require_failed", {
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : String(error),
  });
  throw error;
}
