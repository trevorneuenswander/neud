"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
exports.spawnNodeProcess = spawnNodeProcess;
exports.resolveNodeModulePath = resolveNodeModulePath;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FORCE_KILL_MS = 3000;
class ProcessManager {
    processes = new Map();
    register(name, child, logFile) {
        this.processes.set(name, { name, child, logFile });
    }
    has(name) {
        const entry = this.processes.get(name);
        return Boolean(entry && entry.child.exitCode === null && !entry.child.killed);
    }
    get(name) {
        return this.processes.get(name);
    }
    remove(name) {
        this.processes.delete(name);
    }
    appendLog(logFile, stream, chunk) {
        if (!logFile)
            return;
        fs_1.default.appendFileSync(logFile, `[${new Date().toISOString()}][${stream}] ${chunk}`);
    }
    async stop(name, gracefulMs = 8000) {
        const entry = this.processes.get(name);
        if (!entry)
            return { exitCode: null, forced: false };
        const { child } = entry;
        if (child.exitCode !== null || child.killed) {
            this.processes.delete(name);
            return { exitCode: child.exitCode, forced: false };
        }
        child.kill("SIGTERM");
        const exited = await waitForExit(child, gracefulMs);
        let forced = false;
        if (!exited) {
            forced = true;
            await forceKillProcessTree(child);
            await waitForExit(child, FORCE_KILL_MS);
        }
        this.processes.delete(name);
        return { exitCode: child.exitCode, forced };
    }
    async stopAll(gracefulMs = 8000) {
        const names = [...this.processes.keys()];
        for (const name of names) {
            await this.stop(name, gracefulMs);
        }
    }
}
exports.ProcessManager = ProcessManager;
function waitForExit(child, timeoutMs) {
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
async function forceKillProcessTree(child) {
    const pid = child.pid;
    if (!pid) {
        child.kill("SIGKILL");
        return;
    }
    if (process.platform === "win32") {
        await new Promise((resolve) => {
            const killer = (0, child_process_1.spawn)("taskkill", ["/PID", String(pid), "/T", "/F"], {
                windowsHide: true,
                stdio: "ignore",
            });
            killer.on("exit", () => resolve());
            killer.on("error", () => {
                try {
                    child.kill("SIGKILL");
                }
                catch {
                    // ignore
                }
                resolve();
            });
        });
        return;
    }
    try {
        process.kill(-pid, "SIGKILL");
    }
    catch {
        try {
            child.kill("SIGKILL");
        }
        catch {
            // ignore
        }
    }
}
function spawnNodeProcess(options) {
    const child = (0, child_process_1.spawn)(process.execPath, [options.entryPath], {
        cwd: options.cwd,
        env: {
            ...options.env,
            ELECTRON_RUN_AS_NODE: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });
    child.stdout?.on("data", (buffer) => {
        const chunk = buffer.toString("utf8");
        options.onStdout?.(chunk);
        if (options.logFile) {
            fs_1.default.appendFileSync(options.logFile, `[${new Date().toISOString()}][stdout] ${chunk}`);
        }
    });
    child.stderr?.on("data", (buffer) => {
        const chunk = buffer.toString("utf8");
        options.onStderr?.(chunk);
        if (options.logFile) {
            fs_1.default.appendFileSync(options.logFile, `[${new Date().toISOString()}][stderr] ${chunk}`);
        }
    });
    return child;
}
function resolveNodeModulePath(cwd, packageName) {
    return path_1.default.join(cwd, "node_modules", packageName);
}
