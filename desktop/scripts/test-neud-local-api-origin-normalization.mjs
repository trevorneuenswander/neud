#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DEFAULT_LOCAL_API_ORIGIN,
  normalizeLocalApiOrigin,
  parseAppSettingValue,
  resolveLocalApiOriginFromCandidates,
} from "../../scripts/live-validation/lib/normalize-local-api-origin.mjs";
import {
  resolveLocalApiOrigin,
} from "../../scripts/live-validation/lib/shared-local-api-origin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const CANONICAL = "http://127.0.0.1:8070";

test("plain origin normalizes correctly", () => {
  assert.equal(normalizeLocalApiOrigin("http://127.0.0.1:8070"), CANONICAL);
});

test("double-quoted origin normalizes correctly", () => {
  assert.equal(normalizeLocalApiOrigin('"http://127.0.0.1:8070"'), CANONICAL);
});

test("single-quoted origin normalizes correctly", () => {
  assert.equal(normalizeLocalApiOrigin("'http://127.0.0.1:8070'"), CANONICAL);
});

test("JSON-encoded origin normalizes correctly", () => {
  assert.equal(normalizeLocalApiOrigin(JSON.stringify(CANONICAL)), CANONICAL);
});

test("trailing slash removed", () => {
  assert.equal(normalizeLocalApiOrigin("http://127.0.0.1:8070/"), CANONICAL);
});

test("whitespace trimmed", () => {
  assert.equal(normalizeLocalApiOrigin("  http://127.0.0.1:8070/  "), CANONICAL);
});

test("invalid scheme rejected", () => {
  assert.equal(normalizeLocalApiOrigin("ftp://127.0.0.1:8070"), null);
});

test("embedded credentials rejected", () => {
  assert.equal(normalizeLocalApiOrigin("http://user:pass@127.0.0.1:8070"), null);
});

test("path rejected", () => {
  assert.equal(normalizeLocalApiOrigin("http://127.0.0.1:8070/api/health"), null);
});

test("query rejected", () => {
  assert.equal(normalizeLocalApiOrigin("http://127.0.0.1:8070?x=1"), null);
});

test("hash rejected", () => {
  assert.equal(normalizeLocalApiOrigin("http://127.0.0.1:8070#frag"), null);
});

test("SQLite quoted legacy value self-heals through parseAppSettingValue", () => {
  const rawValueJson = JSON.stringify(CANONICAL);
  const decoded = parseAppSettingValue(rawValueJson);
  assert.equal(normalizeLocalApiOrigin(decoded), CANONICAL);
});

test("diagnostic resolver decodes app_settings value_json once", () => {
  const settings = new Map([
    ["neud.localApiUrl", JSON.stringify(CANONICAL)],
    ["neud.localApiSessionToken", JSON.stringify("session-token")],
  ]);
  const resolved = resolveLocalApiOrigin({ settings });
  assert.equal(resolved.resolvedLocalApiOrigin, CANONICAL);
  assert.equal(resolved.sessionToken, "session-token");
});

test("session config and IPC use shared normalizer", () => {
  const sessionToken = read("desktop/src/auth/local-session-token.ts");
  const ipc = read("desktop/src/ipc/local-data.ts");
  const renderer = read("src/lib/local/local-api-origin.ts");
  assert.match(sessionToken, /normalizeLocalApiOrigin/);
  assert.match(ipc, /normalizeLocalApiOrigin/);
  assert.match(renderer, /normalizeLocalApiOrigin/);
});

test("renderer and diagnostic share canonical default origin", () => {
  const web = read("src/lib/local/normalize-local-api-origin.ts");
  const diagnostic = read("scripts/live-validation/lib/normalize-local-api-origin.mjs");
  assert.match(web, /8070/);
  assert.match(diagnostic, /8070/);
  assert.equal(DEFAULT_LOCAL_API_ORIGIN, CANONICAL);
});

test("startup self-heals stored local API origin", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /canonicalLocalApiOrigin/);
  assert.match(main, /LOCAL_API_URL_SETTING_KEY/);
  assert.match(main, /normalizeLocalApiOrigin/);
});

test("health route reports normalized origin", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /normalizeLocalApiOrigin\(this\.baseUrl\)/);
});

test("candidate resolver falls back to default", () => {
  assert.equal(
    resolveLocalApiOriginFromCandidates(['"http://127.0.0.1:8070"']),
    CANONICAL,
  );
  assert.equal(resolveLocalApiOriginFromCandidates([null, "not-a-url"]), CANONICAL);
});

test("publishing manager remains independent from origin normalization", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /publishingManager/);
  assert.doesNotMatch(main, /normalizeLocalApiOrigin[\s\S]{0,80}publishingManager/);
});
