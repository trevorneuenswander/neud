#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("display data route is force-dynamic and no-store proxied", () => {
  const route = read("src/app/api/display/[projectId]/[slug]/data/route.ts");
  const proxy = read("src/lib/displays/project-display-api-proxy.ts");
  assert.match(route, /force-dynamic/);
  assert.match(route, /revalidate\s*=\s*0/);
  assert.match(proxy, /cache:\s*"no-store"/);
  assert.match(proxy, /next_proxy_request_received/);
  assert.match(proxy, /next_proxy_fetch_finished/);
});

test("live display runtime supersedes in-flight fetch on SSE events", () => {
  const runtime = read("public/neud-display-runtime.js");
  assert.match(runtime, /liveFetchSupersededInFlight/);
  assert.match(runtime, /if \(fromEvent\)/);
  assert.match(runtime, /activeRequest\.abort\(\)/);
  assert.match(runtime, /fetchGeneration/);
  assert.match(runtime, /X-NEUD-Display-Fetch-Request-Id/);
});

test("local API logs display GET receive/response pipeline stages", () => {
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /local_api\.display_get_received/);
  assert.match(api, /local_api\.display_get_response_started/);
  assert.match(api, /\/api\/internal\/live-display-pipeline/);
});
