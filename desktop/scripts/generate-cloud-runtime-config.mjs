import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "desktop", "staging", "runtime-config");
const outputFile = path.join(outputDir, "cloud.json");

const FORBIDDEN_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
  "SERVICE_ROLE",
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

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

const PUBLIC_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

function resolvePublicConfigValues() {
  const envLocal = parseEnvFile(path.join(repoRoot, ".env.local"));
  const merged = {};

  for (const key of PUBLIC_KEYS) {
    if (envLocal[key]) {
      merged[key] = envLocal[key];
    }
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    merged.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    merged.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }

  return merged;
}

function assertNoSecretKeys(values) {
  for (const key of Object.keys(values)) {
    if (FORBIDDEN_KEYS.some((forbidden) => key.includes(forbidden))) {
      throw new Error(`Refusing to package secret key: ${key}`);
    }
  }
}

function main() {
  const values = resolvePublicConfigValues();
  assertNoSecretKeys(values);

  const supabaseUrl = values.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supabasePublishableKey =
    values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing public Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local before building the desktop release.",
    );
  }

  if (supabasePublishableKey.toLowerCase().includes("service_role")) {
    throw new Error("Refusing to package a service-role Supabase key.");
  }

  let urlHost = "invalid";
  try {
    urlHost = new URL(supabaseUrl).host;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const payload = {
    supabaseUrl,
    supabasePublishableKey,
    generatedAt: new Date().toISOString(),
    source: ".env.local",
    urlHost,
  };

  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Generated packaged cloud runtime config at ${outputFile} (${urlHost})`);
}

main();
