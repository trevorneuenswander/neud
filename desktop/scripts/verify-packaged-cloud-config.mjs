import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(desktopRoot, "release", "win-unpacked");
const configPath = path.join(releaseRoot, "resources", "runtime-config", "cloud.json");

test("packaged cloud runtime config exists in win-unpacked resources", () => {
  assert.equal(
    fs.existsSync(configPath),
    true,
    `Expected ${configPath} to exist after electron-builder dir packaging`,
  );
});

test("packaged cloud runtime config contains only public Supabase values", () => {
  const raw = fs.readFileSync(configPath, "utf8");
  assert.doesNotMatch(raw, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(raw, /service_role/i);

  const config = JSON.parse(raw);
  assert.equal(typeof config.supabaseUrl, "string");
  assert.ok(config.supabaseUrl.startsWith("https://"));
  assert.equal(typeof config.supabasePublishableKey, "string");
  assert.ok(config.supabasePublishableKey.length > 20);
  assert.equal(typeof config.urlHost, "string");
  assert.ok(config.urlHost.length > 0);
});

test("packaged win-unpacked does not ship .env.local", () => {
  const forbidden = [
    path.join(releaseRoot, "resources", "staging", "next", ".env.local"),
    path.join(releaseRoot, ".env.local"),
  ];
  for (const filePath of forbidden) {
    assert.equal(fs.existsSync(filePath), false, `Must not package ${filePath}`);
  }
});
