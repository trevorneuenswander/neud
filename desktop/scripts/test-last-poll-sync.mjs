import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("last poll uses shared engine status session and formatTimeAgo", () => {
  const lastPoll = readSrc("src/components/projects/ProjectLastPollStatus.tsx");
  const hook = readSrc("src/lib/data-engines/engine-status-session-client.ts");
  const format = readSrc("src/lib/data-engines/format.ts");
  const diagnostics = readSrc("src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx");
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(lastPoll.includes("useEngineLastPollAt"));
  assert.ok(hook.includes("subscribeToDesktopEngineStatus"));
  assert.ok(hook.includes("1000"));
  assert.ok(format.includes("formatTimeAgo"));
  assert.ok(!format.includes('"just now"'));
  assert.ok(diagnostics.includes("useEngineLastPollAt"));
  assert.ok(diagnostics.includes("last_run_succeeded_at"));
  assert.ok(diagnostics.includes("formatAbsoluteDateTime"));
  assert.ok(engineManager.includes("subscribeEngineStatus"));
  assert.ok(engineManager.includes("engineStatusSnapshot"));
  assert.ok(localData.includes("lastRunSucceededAt"));
  assert.ok(localData.includes("pushEngineStatusSnapshot"));
});

test("formatTimeAgo renders zero seconds instead of just now", () => {
  const source = readSrc("src/lib/data-engines/format.ts");
  assert.ok(source.includes("formatTimeAgo"));
  assert.ok(source.includes('return `${elapsedSeconds} second${elapsedSeconds === 1 ? "" : "s"} ago`'));
  assert.ok(!source.includes('"just now"'));
});
