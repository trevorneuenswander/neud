import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const DEFAULT_LIVE_VALIDATION_PROJECT_REF = "abtvefbwnismoqweokqu";

export function getRepoRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..", "..");
}

export function loadLiveValidationEnv(repoRoot) {
  const publicEnvPath = path.join(repoRoot, ".env.local");
  const validationEnvPath = path.join(repoRoot, ".env.live-validation.local");

  if (fs.existsSync(publicEnvPath)) {
    dotenv.config({ path: publicEnvPath });
  }

  if (fs.existsSync(validationEnvPath)) {
    dotenv.config({ path: validationEnvPath, override: true });
  }

  return {
    publicEnvPath,
    validationEnvPath,
    validationEnvExists: fs.existsSync(validationEnvPath),
  };
}

export function extractProjectRefFromSupabaseUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

export function extractProjectRefFromDbUrl(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    const host = parsed.hostname.toLowerCase();

    const poolerMatch = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/);
    if (poolerMatch) {
      return poolerMatch[1];
    }

    const directMatch = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
    if (directMatch) {
      return directMatch[1];
    }

    const userMatch = parsed.username?.match(/^postgres\.([a-z0-9-]+)$/);
    if (userMatch) {
      return userMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export function getExpectedProjectRef() {
  return (
    process.env.NEUD_LIVE_VALIDATION_PROJECT_REF?.trim() ||
    DEFAULT_LIVE_VALIDATION_PROJECT_REF
  );
}

export function assertLiveValidationTarget() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  }

  const expectedRef = getExpectedProjectRef();
  const publicRef = extractProjectRefFromSupabaseUrl(supabaseUrl);
  if (publicRef !== expectedRef) {
    throw new Error(
      `Supabase URL project ref mismatch: expected ${expectedRef}, got ${publicRef}`,
    );
  }

  const dbUrl = process.env.NEUD_SUPABASE_DB_URL?.trim();
  if (!dbUrl) {
    throw new Error(
      "Missing NEUD_SUPABASE_DB_URL. Add it to .env.live-validation.local (gitignored).",
    );
  }

  const dbRef = extractProjectRefFromDbUrl(dbUrl);
  if (!dbRef) {
    throw new Error(
      "Could not derive project ref from NEUD_SUPABASE_DB_URL host. Aborting for safety.",
    );
  }

  if (dbRef !== expectedRef) {
    throw new Error(
      `Database connection project ref mismatch: expected ${expectedRef}, got ${dbRef}`,
    );
  }

  if (publicRef !== dbRef) {
    throw new Error(
      `Public Supabase URL and database connection target different projects (${publicRef} vs ${dbRef})`,
    );
  }

  if (process.env.NEUD_LIVE_VALIDATION_ALLOW_PRODUCTION === "1") {
    console.warn("NEUD_LIVE_VALIDATION_ALLOW_PRODUCTION=1 — production guard bypassed.");
  }

  return {
    expectedRef,
    publicRef,
    dbRef,
    supabaseUrlHost: new URL(supabaseUrl).hostname,
    dbHost: new URL(dbUrl).hostname,
  };
}
