import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display size activity resolves authenticated actor", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const sizeBlock = localData.slice(
    localData.indexOf("setDisplaySize("),
    localData.indexOf("setDisplaySize(") + 1200,
  );
  assert.match(sizeBlock, /resolveCurrentActivityActor\(\)/);
  assert.match(sizeBlock, /actor,/);
  assert.match(sizeBlock, /display\.size-changed/);
});

test("display refresh rate activity resolves authenticated actor", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const block = localData.slice(
    localData.indexOf("setDisplayRefreshRate("),
    localData.indexOf("setDisplayRefreshRate(") + 1400,
  );
  assert.match(block, /resolveCurrentActivityActor\(\)/);
  assert.match(block, /actor,/);
});
