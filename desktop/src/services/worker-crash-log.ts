import fs from "fs";
import path from "path";
import { app } from "electron";

const WORKER_CRASH_LOG_FILENAME = "worker-crash.log";

const SAFE_ENV_KEYS = [
  "ELECTRON_RUN_AS_NODE",
  "NODE_ENV",
  "NEUD_RESOURCES_PATH",
  "NEUD_USER_DATA_PATH",
  "NEUD_APP_DATA_DIR",
  "NEUD_PACKAGED",
  "ENGINE_ID",
  "WORKER_ID",
  "NEUD_ENGINE_START_CORRELATION_ID",
] as const;

export function getWorkerCrashLogPath(): string {
  return path.join(app.getPath("userData"), "logs", WORKER_CRASH_LOG_FILENAME);
}

export function ensureWorkerCrashLogDir(): string {
  const logPath = getWorkerCrashLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return logPath;
}

export function sanitizeWorkerEnvForLog(env: NodeJS.ProcessEnv): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {};
  for (const key of SAFE_ENV_KEYS) {
    snapshot[key] = env[key] ?? null;
  }
  return snapshot;
}

function appendWorkerCrashLogLine(line: string): void {
  try {
    const logPath = ensureWorkerCrashLogDir();
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    try {
      const fallback = path.join(
        process.env.APPDATA ?? process.env.TEMP ?? "",
        "NEUD",
        "logs",
        WORKER_CRASH_LOG_FILENAME,
      );
      if (!fallback || fallback.includes("undefined")) {
        return;
      }
      fs.mkdirSync(path.dirname(fallback), { recursive: true });
      fs.appendFileSync(fallback, line, "utf8");
    } catch {
      // crash logging must not throw
    }
  }
}

export function appendWorkerCrashLog(entry: Record<string, unknown>): void {
  appendWorkerCrashLogLine(`[${new Date().toISOString()}] ${JSON.stringify(entry)}\n`);
}

export function appendWorkerCrashStream(
  stream: "stdout" | "stderr",
  chunk: string,
  metadata: Record<string, unknown> = {},
): void {
  appendWorkerCrashLog({
    event: "stream",
    stream,
    chunk,
    ...metadata,
  });
}

export function flushWorkerCrashExitReport(input: {
  correlationId?: string | null;
  engineId: string;
  entryPath: string;
  cwd: string;
  execPath: string;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  spawnError?: string | null;
}): void {
  appendWorkerCrashLog({
    event: "exit",
    correlationId: input.correlationId ?? null,
    engineId: input.engineId,
    timestamp: new Date().toISOString(),
    workerEntryPath: input.entryPath,
    processExecPath: input.execPath,
    processResourcesPath: input.resourcesPath,
    cwd: input.cwd,
    nodeEnv: input.env.NODE_ENV ?? null,
    electronRunAsNode: input.env.ELECTRON_RUN_AS_NODE ?? null,
    childEnvironment: sanitizeWorkerEnvForLog(input.env),
    exitCode: input.exitCode,
    exitSignal: input.exitSignal,
    spawnError: input.spawnError ?? null,
    stdout: input.stdout,
    stderr: input.stderr,
  });
}
