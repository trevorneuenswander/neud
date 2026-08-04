import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display cards show active version badge beside title", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /DisplayVersionBadge/);
  assert.match(custom, /DisplayVersionBadge/);
});

test("version summaries use active published revision numbering", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const page = read("src/app/(portal)/projects/[slug]/displays/page.tsx");
  assert.match(service, /listDisplayVersionSummaries/);
  assert.match(service, /publishedRevisionId/);
  assert.match(page, /localListDisplayVersionSummaries/);
  assert.match(page, /activeVersionNumber/);
});

test("missing active version shows safe unavailable label", () => {
  const badge = read("src/components/displays/DisplayVersionBadge.tsx");
  assert.match(badge, /DISPLAY_VERSION_UNAVAILABLE_LABEL/);
});

test("active version badge uses compact v format", () => {
  const badge = read("src/components/displays/DisplayVersionBadge.tsx");
  assert.match(badge, /formatDisplayVersion/);
});
