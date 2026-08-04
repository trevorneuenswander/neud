import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";
import type { AppPaths } from "./app-paths";
import {
  getLegacyUserDataRoots,
  migrateLegacyEngineBrowserData,
  migrateLegacyEngineCookies,
} from "./legacy-runtime-migration";
import { hasPersistedSessionCookies } from "./engine-session-auth";
import { NEUD_ALLOW_PLAINTEXT_CREDENTIALS } from "../env/neud-env";
import { assertEmail, assertEngineId, assertPassword } from "../utils/validate";

type StoredCredentials = {
  email: string;
  password: string;
};

export type CredentialMeta = {
  hasCredentials: boolean;
  email: string | null;
  hasPersistedSession: boolean;
};

function credentialFile(paths: AppPaths, engineId: string): string {
  return path.join(paths.credentialsDir, `${engineId}.cred`);
}

function legacyCredentialFiles(paths: AppPaths, engineId: string): string[] {
  return [
    path.join(paths.credentialsDir, `${engineId}.cred`),
    path.join(paths.credentialsDir, "bag-auction.cred"),
    path.join(paths.credentialsDir, "bag-graphics.cred"),
    path.join(paths.credentialsDir, "webpage-scraper.cred"),
  ];
}

function canUseSafeStorage(): boolean {
  try {
    return safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    return false;
  }
}

function readDevFallback(): StoredCredentials | null {
  if (!NEUD_ALLOW_PLAINTEXT_CREDENTIALS()) {
    return null;
  }

  const email = process.env.BAG_AUCTION_EMAIL?.trim();
  const password = process.env.BAG_AUCTION_PASSWORD;
  if (!email || !password) {
    return null;
  }

  return { email, password };
}

function tryReadEncryptedCredentialFile(
  filePath: string,
): StoredCredentials | null {
  if (!canUseSafeStorage() || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(decrypted) as StoredCredentials;
    if (!parsed.email || !parsed.password) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export class CredentialStore {
  constructor(private readonly paths: AppPaths) {}

  hasCredentials(engineId: string): boolean {
    return this.getCredentialMeta(engineId).hasCredentials;
  }

  hasRunnableAuth(engineId: string): boolean {
    const meta = this.getCredentialMeta(engineId);
    return meta.hasCredentials || meta.hasPersistedSession;
  }

  getCredentialMeta(engineId: string): CredentialMeta {
    const id = assertEngineId(engineId);
    this.migrateLegacyCredentials(id);

    const hasPersistedSession = hasPersistedSessionCookies(this.paths, id);
    const stored = this.readStoredCredentials(id);
    if (stored) {
      return {
        hasCredentials: true,
        email: stored.email,
        hasPersistedSession,
      };
    }

    const fallback = readDevFallback();
    if (fallback) {
      return {
        hasCredentials: true,
        email: fallback.email,
        hasPersistedSession,
      };
    }

    return {
      hasCredentials: false,
      email: null,
      hasPersistedSession,
    };
  }

  saveCredentials(
    engineId: string,
    input: { email: string; password: string },
  ): void {
    const id = assertEngineId(engineId);
    const email = assertEmail(input.email);
    const password = assertPassword(input.password);

    if (!canUseSafeStorage()) {
      throw new Error(
        "Secure credential storage is unavailable on this system.",
      );
    }

    const payload = safeStorage.encryptString(
      JSON.stringify({ email, password }),
    );
    fs.writeFileSync(credentialFile(this.paths, id), payload);
  }

  clearCredentials(engineId: string): void {
    const id = assertEngineId(engineId);
    const file = credentialFile(this.paths, id);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  getCredentialsForWorker(engineId: string): StoredCredentials | null {
    const id = assertEngineId(engineId);
    this.migrateLegacyCredentials(id);
    return this.readStoredCredentials(id) ?? readDevFallback();
  }

  getCredentialsForRenderer(engineId: string): StoredCredentials | null {
    return this.getCredentialsForWorker(engineId);
  }

  private readStoredCredentials(engineId: string): StoredCredentials | null {
    const file = credentialFile(this.paths, engineId);
    return tryReadEncryptedCredentialFile(file);
  }

  private migrateLegacyCredentials(engineId: string): void {
    const target = credentialFile(this.paths, engineId);
    if (this.readStoredCredentials(engineId)) {
      return;
    }

    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
        console.info(
          `[CredentialMigration] removed unusable credential blob engine=${engineId}`,
        );
      } catch {
        // best-effort cleanup of unusable copied credential blobs
      }
    }

    for (const legacyFile of legacyCredentialFiles(this.paths, engineId)) {
      if (legacyFile === target || !fs.existsSync(legacyFile)) {
        continue;
      }

      const decrypted = tryReadEncryptedCredentialFile(legacyFile);
      if (decrypted) {
        try {
          this.saveCredentials(engineId, decrypted);
          console.info(
            `[CredentialMigration] engine=${engineId} source=${legacyFile}`,
          );
          return;
        } catch {
          // try next legacy candidate
        }
      }
    }

    for (const legacyRoot of getLegacyUserDataRoots(this.paths.root)) {
      const legacyCandidates = [
        path.join(legacyRoot, "config", "credentials", `${engineId}.cred`),
        path.join(legacyRoot, "config", "credentials", "bag-auction.cred"),
        path.join(legacyRoot, "config", "credentials", "bag-graphics.cred"),
        path.join(legacyRoot, "config", "credentials", "webpage-scraper.cred"),
      ];

      for (const legacyFile of legacyCandidates) {
        const decrypted = tryReadEncryptedCredentialFile(legacyFile);
        if (!decrypted) continue;

        try {
          this.saveCredentials(engineId, decrypted);
          console.info(
            `[CredentialMigration] engine=${engineId} source=${legacyFile}`,
          );
          return;
        } catch {
          // try next legacy candidate
        }
      }
    }
  }

  migrateEnvCredentialsOnce(engineId: string): boolean {
    if (!NEUD_ALLOW_PLAINTEXT_CREDENTIALS()) {
      return false;
    }

    return this.seedFromEnvironment(engineId);
  }

  seedFromEnvironment(engineId: string): boolean {
    const id = assertEngineId(engineId);
    if (this.readStoredCredentials(id)) {
      return false;
    }

    const email =
      process.env.BAG_AUCTION_EMAIL?.trim() ||
      process.env.AUCTION_EMAIL?.trim();
    const password =
      process.env.BAG_AUCTION_PASSWORD || process.env.AUCTION_PASSWORD;
    if (!email || !password) {
      return false;
    }

    if (!canUseSafeStorage()) {
      return false;
    }

    try {
      this.saveCredentials(id, { email, password });
      return true;
    } catch {
      return false;
    }
  }

  getRedactionValues(engineId: string): string[] {
    const creds = this.getCredentialsForWorker(engineId);
    if (!creds) return [];
    return [creds.email, creds.password];
  }
}

export function loadSupabasePublicConfigFromPaths(paths: AppPaths): {
  supabaseUrl: string;
  supabasePublishableKey: string;
} | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (fromEnv) {
    return {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    };
  }

  if (!fs.existsSync(paths.serverEnvFile)) {
    return null;
  }

  const lines = fs.readFileSync(paths.serverEnvFile, "utf8").split(/\r?\n/);
  const values: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }

  if (!values.NEXT_PUBLIC_SUPABASE_URL || !values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  return {
    supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function isPackagedApp(): boolean {
  return app.isPackaged;
}
