import fs from "fs";
import net from "net";
import path from "path";
import { app } from "electron";
import type { AppPaths } from "./app-paths";
import { ProcessManager, spawnNodeProcess } from "./process-manager";
import { NEUD_DESKTOP_DEV, NEUD_DEV_SERVER_URL } from "../env/neud-env";
import { isPackagedDesktopRuntime } from "../lib/packaged-runtime";
import {
  DEFAULT_LOCAL_API_ORIGIN,
  normalizeLocalApiOrigin,
} from "../lib/normalize-local-api-origin";

const PACKAGED_PORT = 45123;
const PORT_RANGE_START = 45123;
const PORT_RANGE_END = 45133;

export class NextServerService {
  private port: number | null = null;
  private baseUrl: string | null = null;

  constructor(
    private readonly paths: AppPaths,
    private readonly processManager: ProcessManager,
  ) {}

  getUrl(): string | null {
    return this.baseUrl;
  }

  async start(
    isDev: boolean,
    options?: { devUrl?: string; localApiUrl?: string },
  ): Promise<string> {
    const devUrl = options?.devUrl ?? "http://127.0.0.1:3000";
    if (isDev) {
      this.baseUrl = devUrl;
      return devUrl;
    }

    const port = await findAvailablePort(PACKAGED_PORT);
    this.port = port;

    const serverDir = path.join(process.resourcesPath, "staging", "next");
    const serverEntry = path.join(serverDir, "server.js");
    const logFile = path.join(this.paths.logs, "next-server.log");

    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        "Packaged Next.js server was not found. Run npm run build:desktop first.",
      );
    }

    const localApiUrl =
      normalizeLocalApiOrigin(options?.localApiUrl) ?? DEFAULT_LOCAL_API_ORIGIN;

    const child = spawnNodeProcess({
      name: "next-server",
      entryPath: serverEntry,
      cwd: serverDir,
      logFile,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        NEUD_USE_LOCAL_DATA: "1",
        NEXT_PUBLIC_NEUD_USE_LOCAL_DATA: "1",
        NEUD_LOCAL_API_URL: localApiUrl,
        NEXT_PUBLIC_NEUD_LOCAL_API_URL: localApiUrl,
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

async function waitForHealth(baseUrl: string, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Local Next.js server did not become ready in time.");
}

async function findAvailablePort(preferred: number): Promise<number> {
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

function range(start: number, end: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value += 1) {
    values.push(value);
  }
  return values;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

export function getDevServerUrl(): string {
  return NEUD_DEV_SERVER_URL();
}

export function isDevMode(): boolean {
  return !isPackagedDesktopRuntime() || NEUD_DESKTOP_DEV();
}
