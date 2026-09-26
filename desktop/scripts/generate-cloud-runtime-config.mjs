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

function isPlaceholderSupabasePublishableKey(key) {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (trimmed.endsWith(".test")) return true;
  if (lower.includes("example") || lower.includes("placeholder") || lower === "test") {
    return true;
  }
  if (lower.includes("service_role")) return true;
  return false;
}

function isValidSupabasePublishableKey(key) {
  const trimmed = key?.trim() ?? "";
  if (isPlaceholderSupabasePublishableKey(trimmed)) return false;
  if (trimmed.startsWith("sb_publishable_")) return trimmed.length >= 20;
  if (trimmed.startsWith("eyJ")) return trimmed.length >= 80;
  return trimmed.length >= 20;
}

function resolvePublicConfigValues() {
  const envLocal = parseEnvFile(path.join(repoRoot, ".env.local"));
  const merged = {};
  const sources = [];

  for (const key of PUBLIC_KEYS) {
    if (envLocal[key]?.trim()) {
      merged[key] = envLocal[key].trim();
    }
  }
  if (Object.keys(merged).length > 0) {
    sources.push(".env.local");
  }

  for (const key of PUBLIC_KEYS) {
    const processValue = process.env[key]?.trim();
    if (!processValue) continue;
    if (
      key === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" &&
      !isValidSupabasePublishableKey(processValue)
    ) {
      continue;
    }
    // .env.local wins over stale shell exports during local package builds.
    if (merged[key]?.trim()) {
      continue;
    }
    merged[key] = processValue;
    if (!sources.includes("process_env")) {
      sources.push("process_env");
    }
  }

  merged.__sources = sources;
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

  if (!isValidSupabasePublishableKey(supabasePublishableKey)) {
    throw new Error(
      "Refusing to package an invalid or placeholder Supabase publishable key. Check .env.local and remove stale NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY process overrides.",
    );
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
    source: values.__sources?.join("+") || "unknown",
    urlHost,
  };

  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Generated packaged cloud runtime config at ${outputFile} (${urlHost})`);
}

main();
