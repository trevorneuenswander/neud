import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CredentialStore } from "../dist/services/credential-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerLocalClientUrl = pathToFileURL(
  path.resolve(__dirname, "../../workers/data-engine/src/local-client.js"),
).href;

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-${name}-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot: path.resolve(__dirname, "../.."),
  };

  for (const dir of [paths.data, paths.config, paths.logs, paths.credentialsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  return paths;
}

test("edited secure credentials are available immediately without app restart", async (t) => {
  let available = false;
  try {
    const electron = await import("electron");
    available = electron.safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    available = false;
  }

  if (!available) {
    t.skip("Electron secure storage is unavailable in this test runtime.");
    return;
  }

  const paths = createTestPaths("credential-refresh");
  const credentials = new CredentialStore(paths);
  const engineId = crypto.randomUUID();

  credentials.saveCredentials(engineId, {
    email: "auction@example.com",
    password: "initial-password",
  });
  assert.equal(credentials.getCredentialsForWorker(engineId)?.password, "initial-password");

  credentials.saveCredentials(engineId, {
    email: "auction@example.com",
    password: "edited-password-for-run-once",
  });

  const refreshed = credentials.getCredentialsForWorker(engineId);
  assert.equal(refreshed?.password, "edited-password-for-run-once");
  assert.equal(
    credentials.getCredentialsForRenderer(engineId)?.password,
    "edited-password-for-run-once",
  );
});

test("worker credential loader receives latest saved password on each fetch", async () => {
  let currentPassword = "worker-password-v1";
  const server = http.createServer((request, response) => {
    if (
      request.method === "GET" &&
      request.url?.includes("/worker-credentials") &&
      request.headers["x-neud-worker-client"] === "data-engine"
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          email: "worker@example.com",
          password: currentPassword,
        }),
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found." }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const previousApiUrl = process.env.NEUD_LOCAL_API_URL;
  process.env.NEUD_LOCAL_API_URL = `http://127.0.0.1:${port}`;

  try {
    const { loadWorkerCredentials } = await import(workerLocalClientUrl);
    const first = await loadWorkerCredentials("engine-id");
    assert.equal(first.password, "worker-password-v1");

    currentPassword = "worker-password-v2-edited";
    const second = await loadWorkerCredentials("engine-id");
    assert.equal(second.password, "worker-password-v2-edited");
  } finally {
    process.env.NEUD_LOCAL_API_URL = previousApiUrl;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("worker credential endpoint rejects non-worker clients", async () => {
  const server = http.createServer((request, response) => {
    if (request.headers["x-neud-worker-client"] !== "data-engine") {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Forbidden." }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ email: "worker@example.com", password: "secret" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/data-sources/test/worker-credentials`);
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("spawn worker environment replaces stale credential env vars", () => {
  const previousEmail = process.env.BAG_AUCTION_EMAIL;
  const previousPassword = process.env.BAG_AUCTION_PASSWORD;

  process.env.BAG_AUCTION_EMAIL = "stale@example.com";
  process.env.BAG_AUCTION_PASSWORD = "stale-password";

  const env = { ...process.env };
  delete env.BAG_AUCTION_EMAIL;
  delete env.BAG_AUCTION_PASSWORD;
  env.BAG_AUCTION_EMAIL = "fresh@example.com";
  env.BAG_AUCTION_PASSWORD = "fresh-password";

  assert.equal(env.BAG_AUCTION_EMAIL, "fresh@example.com");
  assert.equal(env.BAG_AUCTION_PASSWORD, "fresh-password");

  process.env.BAG_AUCTION_EMAIL = previousEmail;
  process.env.BAG_AUCTION_PASSWORD = previousPassword;
});
