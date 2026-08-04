import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display details save uses canonical displays patch route", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  const api = read("src/lib/local/displays-api.ts");
  assert.match(client, /localUpdateDisplayDetails/);
  assert.doesNotMatch(client, /localUpdateDeveloperDisplayDetails/);
  assert.match(api, /localUpdateDisplayDetails/);
  assert.match(api, /method: "PATCH"/);
});

test("local api patch handler routes metadata to developer tools service", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  const api = read("src/lib/local/displays-api.ts");
  assert.match(server, /body\.name !== undefined \|\| body\.description !== undefined/);
  assert.match(server, /updateDisplayDetails/);
  assert.match(api, /localUpdateDisplayDetails/);
  assert.match(api, /encodeURIComponent\(displayId\)/);
});

test("metadata save sends canonical name field", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  const api = read("src/lib/local/displays-api.ts");
  assert.match(client, /name: trimmedName/);
  assert.match(api, /name\?: string/);
});

test("metadata updates preserve html revision fields in service", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const detailsBlock = service.slice(
    service.indexOf("updateDisplayDetails("),
    service.indexOf("private resolveUniqueDisplaySlug"),
  );
  assert.doesNotMatch(detailsBlock, /writeDisplayPublished/);
  assert.doesNotMatch(detailsBlock, /revisions\.create/);
  assert.match(detailsBlock, /publishedRevisionId: code\.publishedRevisionId/);
  assert.match(detailsBlock, /updateName/);
});
