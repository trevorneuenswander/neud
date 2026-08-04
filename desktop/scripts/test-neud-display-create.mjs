import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("canonical create route posts to project displays", () => {
  const api = read("src/lib/local/displays-api.ts");
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /localCreateDisplay/);
  assert.match(api, /method: "POST"/);
  assert.match(server, /projectDisplaysMatch && request.method === "POST"/);
});

test("create display is atomic with rollback and user order append", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const main = read("desktop/src/main.ts");
  assert.match(service, /createdDisplayId/);
  assert.match(service, /deleteById\(createdDisplayId\)/);
  assert.match(service, /Initial uploaded HTML/);
  assert.match(service, /onDisplayCreated/);
  assert.match(main, /appendDisplayToUserOrder/);
});

test("new displays appear immediately in page client state", () => {
  const page = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(page, /handleDisplayCreated/);
  assert.match(page, /buildCustomDisplayListItem/);
});
