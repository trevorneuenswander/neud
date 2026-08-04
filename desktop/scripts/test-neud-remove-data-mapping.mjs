import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function missing(relativePath) {
  return !fs.existsSync(path.join(root, relativePath));
}

test("mapping UI components are removed", () => {
  assert.ok(missing("src/components/displays/DisplayDataMappingEditor.tsx"));
  assert.ok(missing("src/lib/displays/display-data-mapping.ts"));
});

test("add and edit flows have no data mapping sections", () => {
  const upload = read("src/components/developer-tools/UploadHtmlDisplayForm.tsx");
  const edit = read("src/components/displays/DisplayEditClient.tsx");
  assert.doesNotMatch(upload, /Data Mapping|DisplayDataMappingEditor|Save Data Mappings/);
  assert.doesNotMatch(edit, /Data Mapping|DisplayDataMappingEditor|Save Data Mappings/);
});

test("mapping runtime scripts are removed", () => {
  assert.ok(missing("public/displays/shared/display-data-mapping.js"));
  assert.ok(missing("public/displays/shared/mapping-preview-helper.js"));
});

test("mapping services and API routes are removed", () => {
  assert.ok(missing("desktop/src/services/display-data-mapping-service.ts"));
  assert.ok(missing("desktop/src/repositories/display-data-mappings-repository.ts"));
  const server = read("desktop/src/services/local-api-server.ts");
  assert.doesNotMatch(server, /data-mappings/);
  assert.doesNotMatch(server, /displayDataMappingService/);
});

test("drop migration removes mapping tables", () => {
  const drop = read("desktop/src/database/migrations/026_drop_display_data_mappings.sql");
  assert.match(drop, /DROP TABLE IF EXISTS display_data_mappings/);
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(migrate, /026_drop_display_data_mappings\.sql/);
});
