import fs from "node:fs";
import path from "node:path";

export const SEEDED_SERVICE_ROLE_SECRET =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.slice2_2_fake_service_role_secret";

const SCANNABLE_EXTENSIONS = /\.(js|cjs|mjs|json|html|txt|env|yml|yaml|asar|map|sql)$/i;
const ENV_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.live-validation.local",
  ".env.production",
  ".env.development",
  "server.env",
]);

const FORBIDDEN_EXECUTABLE_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /NEUD_SUPABASE_DB_URL/,
  /supabaseServiceRoleKey/,
  /getSupabaseMain/,
  /loadServerConfig/,
  /createAdminClient/,
  /auth\.admin\./,
  /SUPABASE_SERVICE_ROLE_KEY\s*=/,
];

const ALLOWED_SQL_ONLY_PATTERNS = [
  /\bservice_role\b/,
  /\bto service_role\b/,
  /\bfrom service_role\b/,
  /\bgrant execute\b[\s\S]*\bservice_role\b/,
];

export function isEmbeddedNextRuntimePath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes("/staging/next/") || normalized.includes("/resources/staging/next/");
}

export function isThirdPartyLibraryPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("/node_modules/@supabase/") ||
    normalized.includes("/node_modules/.pnpm/")
  );
}

export function isAppOwnedPath(filePath, rootDir) {
  const normalized = filePath.replace(/\\/g, "/");
  const root = rootDir.replace(/\\/g, "/");

  if (isEmbeddedNextRuntimePath(filePath)) {
    return false;
  }

  if (normalized.includes("/staging/worker/")) {
    return true;
  }
  if (normalized.includes("/dist/") && !normalized.includes("/node_modules/")) {
    return true;
  }
  if (normalized.includes("/resources/app.asar.unpacked/")) {
    return true;
  }
  if (root.endsWith("/staging/worker") || root.endsWith("\\staging\\worker")) {
    return true;
  }
  return !isThirdPartyLibraryPath(filePath);
}

export function walkScannableFiles(dir, matches = []) {
  if (!fs.existsSync(dir)) {
    return matches;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" && fullPath.includes(`${path.sep}.git${path.sep}`)) {
        continue;
      }
      walkScannableFiles(fullPath, matches);
      continue;
    }

    if (ENV_FILE_NAMES.has(entry.name) || SCANNABLE_EXTENSIONS.test(entry.name)) {
      if (entry.name.endsWith(".asar")) {
        continue;
      }
      matches.push(fullPath);
    }
  }

  return matches;
}

export function isSqlMigrationFile(filePath) {
  return filePath.endsWith(".sql");
}

export function scanFileContents(contents, filePath, options = {}) {
  const violations = [];
  const seededSecret = options.seededSecret ?? SEEDED_SERVICE_ROLE_SECRET;
  const rootDir = options.rootDir ?? "";
  const appOwned = isAppOwnedPath(filePath, rootDir);

  if (contents.includes(seededSecret)) {
    violations.push("seeded service-role secret present");
  }

  if (/NEUD_SUPABASE_DB_URL\s*=/.test(contents)) {
    violations.push("database connection URI assignment present");
  }

  if (ENV_FILE_NAMES.has(path.basename(filePath))) {
    violations.push("packaged environment file present");
  }

  if (isSqlMigrationFile(filePath)) {
    if (/SUPABASE_SERVICE_ROLE_KEY\s*=/.test(contents)) {
      violations.push("service-role env assignment in packaged SQL");
    }
    return violations;
  }

  if (!appOwned) {
    if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?[A-Za-z0-9._-]{20,}/.test(contents)) {
      violations.push("literal service-role credential value present");
    }
    if (/NEUD_SUPABASE_DB_URL\s*=\s*['"]?postgres/.test(contents)) {
      violations.push("literal database connection URI present");
    }
    return violations;
  }

  for (const pattern of FORBIDDEN_EXECUTABLE_PATTERNS) {
    if (pattern.test(contents)) {
      violations.push(`forbidden pattern ${pattern}`);
    }
  }

  if (/\bservice_role\b/.test(contents) && /\bcreateClient\b/.test(contents)) {
    violations.push("service-role client construction");
  }
  if (filePath.endsWith("supabase.js") && !filePath.includes(`${path.sep}node_modules${path.sep}`)) {
    violations.push("privileged supabase.js module packaged");
  }

  return violations;
}

export function scanDirectory(rootDir, options = {}) {
  const files = walkScannableFiles(rootDir);
  const findings = [];

  for (const filePath of files) {
    let contents;
    try {
      contents = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const violations = scanFileContents(contents, filePath, { ...options, rootDir });
    if (violations.length > 0) {
      findings.push({ filePath, violations });
    }
  }

  return findings;
}

export async function extractAsar(asarPath, extractDir) {
  const { extractAll } = await import("@electron/asar");
  fs.mkdirSync(extractDir, { recursive: true });
  extractAll(asarPath, extractDir);
  return extractDir;
}

export function findReleaseRoots(desktopRoot) {
  const releaseRoot = path.join(desktopRoot, "release");
  const candidates = [];

  const winUnpacked = path.join(releaseRoot, "win-unpacked");
  if (fs.existsSync(winUnpacked)) {
    candidates.push(winUnpacked);
  }

  if (fs.existsSync(releaseRoot)) {
    for (const entry of fs.readdirSync(releaseRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(releaseRoot, entry.name);
      if (fullPath.endsWith("win-unpacked") || entry.name.includes("unpacked")) {
        candidates.push(fullPath);
      }
    }
  }

  const stagingRoot = path.join(desktopRoot, "staging");
  if (fs.existsSync(stagingRoot)) {
    candidates.push(stagingRoot);
  }

  return [...new Set(candidates)];
}
