"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextServerService = void 0;
exports.getDevServerUrl = getDevServerUrl;
exports.isDevMode = isDevMode;
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const process_manager_1 = require("./process-manager");
const neud_env_1 = require("../env/neud-env");
const PACKAGED_PORT = 45123;
const PORT_RANGE_START = 45123;
const PORT_RANGE_END = 45133;
class NextServerService {
    paths;
    processManager;
    port = null;
    baseUrl = null;
    constructor(paths, processManager) {
        this.paths = paths;
        this.processManager = processManager;
    }
    getUrl() {
        return this.baseUrl;
    }
    async start(isDev, devUrl = "http://127.0.0.1:3000") {
        if (isDev) {
            this.baseUrl = devUrl;
            return devUrl;
        }
        const port = await findAvailablePort(PACKAGED_PORT);
        this.port = port;
        const serverDir = path_1.default.join(process.resourcesPath, "staging", "next");
        const serverEntry = path_1.default.join(serverDir, "server.js");
        const logFile = path_1.default.join(this.paths.logs, "next-server.log");
        if (!fs_1.default.existsSync(serverEntry)) {
            throw new Error("Packaged Next.js server was not found. Run npm run build:desktop first.");
        }
        const child = (0, process_manager_1.spawnNodeProcess)({
            name: "next-server",
            entryPath: serverEntry,
            cwd: serverDir,
            logFile,
            env: {
                ...process.env,
                NODE_ENV: "production",
                PORT: String(port),
                HOSTNAME: "127.0.0.1",
            },
        });
        this.processManager.register("next-server", child, logFile);
        this.baseUrl = `http://127.0.0.1:${port}`;
        await waitForHealth(this.baseUrl);
        return this.baseUrl;
    }
    async stop() {
        await this.processManager.stop("next-server");
        this.baseUrl = null;
        this.port = null;
    }
}
exports.NextServerService = NextServerService;
async function waitForHealth(baseUrl, timeoutMs = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) {
                return;
            }
        }
        catch {
            // retry
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Local Next.js server did not become ready in time.");
}
async function findAvailablePort(preferred) {
    const candidates = [
        preferred,
        ...range(PORT_RANGE_START, PORT_RANGE_END).filter((p) => p !== preferred),
    ];
    for (const port of candidates) {
        if (await isPortFree(port)) {
            return port;
        }
    }
    throw new Error("Unable to find a free loopback port for the local server.");
}
function range(start, end) {
    const values = [];
    for (let value = start; value <= end; value += 1) {
        values.push(value);
    }
    return values;
}
function isPortFree(port) {
    return new Promise((resolve) => {
        const server = net_1.default.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
            server.close(() => resolve(true));
        });
        server.listen(port, "127.0.0.1");
    });
}
function getDevServerUrl() {
    return (0, neud_env_1.NEUD_DEV_SERVER_URL)();
}
function isDevMode() {
    return !electron_1.app.isPackaged || (0, neud_env_1.NEUD_DESKTOP_DEV)();
}
