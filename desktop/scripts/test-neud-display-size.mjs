import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display size options are 1920x1080 and 3840x2160", () => {
  const size = read("src/lib/displays/display-size.ts");
  assert.match(size, /1920x1080/);
  assert.match(size, /3840x2160/);
});

test("display size select is on display cards", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /DisplaySizeSelect/);
  assert.match(custom, /DisplaySizeSelect/);
});

test("sqlite migration adds display width and height", () => {
  const migration = read("desktop/src/database/migrations/023_display_size.sql");
  assert.match(migration, /display_width/);
  assert.match(migration, /display_height/);
});

test("display size patch route exists", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /display-size/);
  assert.match(server, /setDisplaySize/);
});
