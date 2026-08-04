import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("refresh rate client uses absolute local API path with project slug", () => {
  const api = read("src/lib/local/displays-api.ts");
  assert.match(api, /\/api\/projects\/\$\{encodeURIComponent\(projectSlug\)\}\/displays\//);
  assert.match(api, /refresh-rate/);
  assert.match(api, /refreshRateMs/);
});

test("refresh rate dropdown shows explicit chevron with native appearance disabled", () => {
  const select = read("src/components/displays/DisplayRefreshRateSelect.tsx");
  assert.match(select, /appearance-none/);
  assert.match(select, /▼/);
  assert.match(select, /pr-7/);
});

test("backend resolves display by id or key and validates refresh rate", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  const server = read("desktop/src/services/local-api-server.ts");

  assert.match(service, /resolveProjectDisplay/);
  assert.match(service, /getByKey/);
  assert.match(server, /resolveLocalApiFailure/);
  assert.match(server, /refresh-rate/);
});

test("display cards roll refresh rate back on failure", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");

  assert.match(card, /setRefreshRateMs\(previousRefreshRateMs\)/);
  assert.match(custom, /setRefreshRateMs\(previousRefreshRateMs\)/);
});

test("canonical display patch route accepts refreshRateMs", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /projectDisplayPatchMatch/);
  assert.match(server, /body\.refreshRateMs/);
});
