import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import {
  logWorkerSigtermInitiated,
  logWorkerLifecycleTimeline,
} from "./worker-lifecycle-diagnostics";

export type ManagedProcess = {
  name: string;
  child: ChildProcess;
  logFile?: string;
};

const FORCE_KILL_MS = 3000;

export class ProcessManager {
  private processes = new Map<string, ManagedProcess>();

  register(name: string, child: ChildProcess, logFile?: string) {
    this.processes.set(name, { name, child, logFile });
  }

  has(name: string): boolean {
    const entry = this.processes.get(name);
    return Boolean(entry && entry.child.exitCode === null && !entry.child.killed);
  }

  get(name: string): ManagedProcess | undefined {
    return this.processes.get(name);
  }

  remove(name: string) {
    this.processes.delete(name);
  }

  appendLog(logFile: string | undefined, stream: "stdout" | "stderr", chunk: string) {
    if (!logFile) return;
    fs.appendFileSync(logFile, `[${new Date().toISOString()}][${stream}] ${chunk}`);
  }

  async stop(name: string, gracefulMs = 8000): Promise<{ exitCode: number | null; forced: boolean }> {
    const entry = this.processes.get(name);
    if (!entry) return { exitCode: null, forced: false };

    const { child } = entry;
    if (child.exitCode !== null || child.killed) {
      this.processes.delete(name);
      return { exitCode: child.exitCode, forced: false };
    }

    logWorkerSigtermInitiated({
      processName: name,
      reason: "ProcessManager.stop",
      signal: "SIGTERM",
      details: { gracefulMs, pid: child.pid ?? null },
    });
    child.kill("SIGTERM");

    const exited = await waitForExit(child, gracefulMs);
    let forced = false;
    if (!exited) {
      forced = true;
      logWorkerSigtermInitiated({
        processName: name,
        reason: "ProcessManager.stop.force-kill-tree",
        signal: "SIGKILL",
        details: { gracefulMs, pid: child.pid ?? null },
      });
      await forceKillProcessTree(child);
      await waitForExit(child, FORCE_KILL_MS);
    }

    this.processes.delete(name);
    return { exitCode: child.exitCode, forced };
  }

  async stopAll(gracefulMs = 8000) {
    logWorkerLifecycleTimeline("process-manager.stop-all", {
      details: { gracefulMs, processCount: this.processes.size },
      includeStack: true,
    });
    const names = [...this.processes.keys()];
    for (const name of names) {
      await this.stop(name, gracefulMs);
    }
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function forceKillProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    logWorkerSigtermInitiated({
      processName: "unknown",
      reason: "forceKillProcessTree.no-pid",
      signal: "SIGKILL",
    });
    child.kill("SIGKILL");
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve();
      });
    });
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

export function spawnNodeProcess(options: {
  name: string;
  entryPath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  logFile?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}): ChildProcess {
  const child = spawn(process.execPath, [options.entryPath], {
    cwd: options.cwd,
    env: {
      ...options.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (buffer: Buffer) => {
    const chunk = buffer.toString("utf8");
    options.onStdout?.(chunk);
    if (options.logFile) {
      fs.appendFileSync(
        options.logFile,
        `[${new Date().toISOString()}][stdout] ${chunk}`,
      );
    }
  });

  child.stderr?.on("data", (buffer: Buffer) => {
    const chunk = buffer.toString("utf8");
    options.onStderr?.(chunk);
    if (options.logFile) {
      fs.appendFileSync(
        options.logFile,
        `[${new Date().toISOString()}][stderr] ${chunk}`,
      );
    }
  });

  return child;
}

export function resolveNodeModulePath(cwd: string, packageName: string): string {
  return path.join(cwd, "node_modules", packageName);
}
