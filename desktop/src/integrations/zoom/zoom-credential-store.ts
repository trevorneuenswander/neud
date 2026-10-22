import fs from "fs";
import path from "path";
import { safeStorage } from "electron";
import type { AppPaths } from "../../services/app-paths";
import { readNeudEnv } from "../../env/neud-env";
import type { ZoomAppCredentials, ZoomOAuthMode } from "./zoom-types";
import { maskSecret } from "./zoom-types";
import { normalizeZoomOAuthMode } from "./zoom-oauth-redirect";

const CREDENTIAL_FILE = "zoom-app.cred";

type StoredZoomBlob = ZoomAppCredentials & {
  lastValidatedAt?: string | null;
};

function canUseSafeStorage(): boolean {
  try {
    return safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    return false;
  }
}

function credentialPath(paths: AppPaths): string {
  return path.join(paths.credentialsDir, CREDENTIAL_FILE);
}

/**
 * Machine-level Zoom Public Client OAuth config.
 * Development and Production Public Client IDs are stored separately.
 * No Client Secret. No plaintext fallback.
 */
export class ZoomCredentialStore {
  constructor(private readonly paths: AppPaths) {}

  getCredentialFilePath(): string {
    return credentialPath(this.paths);
  }

  isEncryptionAvailable(): boolean {
    return canUseSafeStorage();
  }

  isConfigured(): boolean {
    return Boolean(this.getActivePublicClientId());
  }

  read(): StoredZoomBlob | null {
    const file = credentialPath(this.paths);
    const envMode = normalizeZoomOAuthMode(readNeudEnv("NEUD_ZOOM_OAUTH_MODE"));
    const envDev = readNeudEnv("NEUD_ZOOM_DEVELOPMENT_PUBLIC_CLIENT_ID") ?? "";
    const envProd = readNeudEnv("NEUD_ZOOM_PRODUCTION_PUBLIC_CLIENT_ID") ?? "";

    type DiskBlob = Partial<StoredZoomBlob> & {
      publicClientId?: string;
      clientId?: string;
      clientSecret?: string;
      accountId?: string;
    };
    let fromDisk: DiskBlob | null = null;

    if (canUseSafeStorage() && fs.existsSync(file)) {
      try {
        const decrypted = safeStorage.decryptString(fs.readFileSync(file));
        fromDisk = JSON.parse(decrypted) as DiskBlob;
      } catch {
        fromDisk = null;
      }
    }

    const legacySingle = String(
      fromDisk?.publicClientId ?? fromDisk?.clientId ?? "",
    ).trim();
    const developmentPublicClientId =
      String(fromDisk?.developmentPublicClientId ?? "").trim() ||
      legacySingle ||
      envDev.trim();
    const productionPublicClientId =
      String(fromDisk?.productionPublicClientId ?? "").trim() || envProd.trim();
    const oauthMode = normalizeZoomOAuthMode(fromDisk?.oauthMode ?? envMode);

    if (!developmentPublicClientId && !productionPublicClientId) {
      return null;
    }

    return {
      oauthMode,
      developmentPublicClientId,
      productionPublicClientId,
      lastValidatedAt:
        typeof fromDisk?.lastValidatedAt === "string"
          ? fromDisk.lastValidatedAt
          : null,
    };
  }

  getActivePublicClientId(): string | null {
    const stored = this.read();
    if (!stored) return null;
    const id =
      stored.oauthMode === "production"
        ? stored.productionPublicClientId
        : stored.developmentPublicClientId;
    return id.trim() || null;
  }

  getOAuthMode(): ZoomOAuthMode {
    return this.read()?.oauthMode ?? "development";
  }

  save(input: {
    oauthMode?: ZoomOAuthMode;
    developmentPublicClientId?: string;
    productionPublicClientId?: string;
    /** @deprecated Maps to developmentPublicClientId. */
    publicClientId?: string;
  }): void {
    if (!canUseSafeStorage()) {
      throw new Error(
        "Secure credential storage is unavailable on this system.",
      );
    }
    const existing = this.read();
    const oauthMode = normalizeZoomOAuthMode(
      input.oauthMode ?? existing?.oauthMode ?? "development",
    );
    const developmentPublicClientId = String(
      input.developmentPublicClientId ??
        input.publicClientId ??
        existing?.developmentPublicClientId ??
        "",
    ).trim();
    const productionPublicClientId = String(
      input.productionPublicClientId ??
        existing?.productionPublicClientId ??
        "",
    ).trim();

    const activeId =
      oauthMode === "production"
        ? productionPublicClientId
        : developmentPublicClientId;
    if (!activeId) {
      throw new Error(
        oauthMode === "production"
          ? "Zoom Production Public Client ID is required."
          : "Zoom Development Public Client ID is required.",
      );
    }

    const payload: StoredZoomBlob = {
      oauthMode,
      developmentPublicClientId,
      productionPublicClientId,
      lastValidatedAt: existing?.lastValidatedAt ?? null,
    };
    const file = credentialPath(this.paths);
    let encrypted: Buffer;
    try {
      encrypted = safeStorage.encryptString(JSON.stringify(payload));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to encrypt Zoom credentials (${detail}).`);
    }
    try {
      fs.mkdirSync(this.paths.credentialsDir, { recursive: true });
      fs.writeFileSync(file, encrypted);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to write Zoom credential file (${detail}).`);
    }
    console.info("[neud-zoom-cred] safeStorage write ok", {
      path: file,
      oauthMode,
      encryptionAvailable: true,
      developmentConfigured: Boolean(developmentPublicClientId),
      productionConfigured: Boolean(productionPublicClientId),
    });
  }

  markValidated(at = new Date().toISOString()): void {
    const current = this.read();
    if (!current || !canUseSafeStorage()) return;
    const next: StoredZoomBlob = { ...current, lastValidatedAt: at };
    try {
      fs.writeFileSync(
        credentialPath(this.paths),
        safeStorage.encryptString(JSON.stringify(next)),
      );
    } catch {
      // Non-fatal
    }
  }

  clear(): void {
    const file = credentialPath(this.paths);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  getPublicMeta(): {
    configured: boolean;
    oauthMode: ZoomOAuthMode;
    publicClientIdMasked: string | null;
    clientIdMasked: string | null;
    developmentConfigured: boolean;
    productionConfigured: boolean;
    lastValidatedAt: string | null;
  } {
    const stored = this.read();
    if (!stored) {
      return {
        configured: false,
        oauthMode: "development",
        publicClientIdMasked: null,
        clientIdMasked: null,
        developmentConfigured: false,
        productionConfigured: false,
        lastValidatedAt: null,
      };
    }
    const active = this.getActivePublicClientId();
    const masked = maskSecret(active);
    return {
      configured: Boolean(active),
      oauthMode: stored.oauthMode,
      publicClientIdMasked: masked,
      clientIdMasked: masked,
      developmentConfigured: Boolean(stored.developmentPublicClientId),
      productionConfigured: Boolean(stored.productionPublicClientId),
      lastValidatedAt: stored.lastValidatedAt ?? null,
    };
  }
}
