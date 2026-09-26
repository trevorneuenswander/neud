#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function describeKey(key) {
  return {
    present: Boolean(key?.trim()),
    length: key?.trim()?.length ?? 0,
    looksJwt: /^eyJ/.test(key ?? ""),
    endsWithTest: (key ?? "").endsWith(".test"),
  };
}

const envLocal = parseEnvFile(path.join(repoRoot, ".env.local"));
const cloudPath = path.join(
  repoRoot,
  "desktop/release/win-unpacked/resources/runtime-config/cloud.json",
);
const cloud = fs.existsSync(cloudPath)
  ? JSON.parse(fs.readFileSync(cloudPath, "utf8"))
  : null;

const standaloneRoot = path.join(repoRoot, "desktop/staging/next");
let standaloneHostHits = 0;
const hostNeedle = envLocal.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(envLocal.NEXT_PUBLIC_SUPABASE_URL).host
  : "supabase.co";

function walk(dir) {
  if (!fs.existsSync(dir) || standaloneHostHits >= 5) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    const source = fs.readFileSync(full, "utf8");
    if (source.includes(hostNeedle)) {
      standaloneHostHits += 1;
      console.log("standalone_contains_host", path.relative(repoRoot, full));
    }
  }
}

console.log(
  JSON.stringify(
    {
      envLocal: {
        urlHost: envLocal.NEXT_PUBLIC_SUPABASE_URL
          ? new URL(envLocal.NEXT_PUBLIC_SUPABASE_URL).host
          : null,
        publishableKey: describeKey(envLocal.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      },
      packagedCloud: cloud
        ? {
            urlHost: cloud.urlHost,
            publishableKey: describeKey(cloud.supabasePublishableKey),
            source: cloud.source,
          }
        : null,
    },
    null,
    2,
  ),
);

walk(standaloneRoot);
console.log("standalone_host_hit_count", standaloneHostHits);
