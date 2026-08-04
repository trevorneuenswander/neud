import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("edit menu uses stable display id route", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /displays\/\$\{display\.id\}\/edit/);
});

test("edit display page uses explicit terminal load states", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  assert.match(client, /DisplayLoadState/);
  assert.match(client, /not-found/);
  assert.match(client, /forbidden/);
  assert.doesNotMatch(client, /loadedDisplayIdRef/);
});

test("edit display fetch resolves through developer tools display source", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(client, /localGetDeveloperDisplay/);
  assert.match(service, /resolveDisplayRecord/);
});
