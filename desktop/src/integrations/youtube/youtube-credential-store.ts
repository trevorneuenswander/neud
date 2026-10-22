import fs from "fs";
import path from "path";
import { safeStorage } from "electron";
import type { AppPaths } from "../../services/app-paths";

const CREDENTIAL_FILE = "youtube-app.cred";

export type YouTubeStoredCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string | null;
  accessToken: string | null;
  accessTokenExpiresAtMs: number | null;
  connectedAs: string | null;
  authState: "not_configured" | "configured" | "connected" | "revoked" | "error";
  lastError: string | null;
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

function emptyCredentials(): YouTubeStoredCredentials {
    return {
      clientId: "",
      clientSecret: "",
      refreshToken: null,
    accessToken: null,
    accessTokenExpiresAtMs: null,
    connectedAs: null,
    authState: "not_configured",
    lastError: null,
  };
}

/**
 * Machine-level YouTube OAuth credentials.
 * Encrypted with Electron safeStorage. No plaintext fallback.
 */
export class YouTubeCredentialStore {
  constructor(private readonly paths: AppPaths) {}

  isEncryptionAvailable(): boolean {
    return canUseSafeStorage();
  }

  read(): YouTubeStoredCredentials {
    const fromEnv = process.env.NEUD_YOUTUBE_CLIENT_ID?.trim() ?? "";
    const file = credentialPath(this.paths);
    if (!canUseSafeStorage() || !fs.existsSync(file)) {
      return {
        ...emptyCredentials(),
        clientId: fromEnv,
        clientSecret: "",
        authState: fromEnv ? "configured" : "not_configured",
      };
    }
    try {
      const decrypted = safeStorage.decryptString(fs.readFileSync(file));
      const parsed = JSON.parse(decrypted) as Partial<YouTubeStoredCredentials>;
      const clientId = String(parsed.clientId ?? "").trim() || fromEnv;
      const clientSecret = String(parsed.clientSecret ?? "").trim();
      const refreshToken = parsed.refreshToken?.trim() || null;
      return {
        clientId,
        clientSecret,
        refreshToken,
        accessToken: parsed.accessToken?.trim() || null,
        accessTokenExpiresAtMs:
          typeof parsed.accessTokenExpiresAtMs === "number"
            ? parsed.accessTokenExpiresAtMs
            : null,
        connectedAs: parsed.connectedAs?.trim() || null,
        authState:
          parsed.authState === "revoked" || parsed.authState === "error"
            ? parsed.authState
            : refreshToken
              ? "connected"
              : clientId
                ? "configured"
                : "not_configured",
        lastError: parsed.lastError ?? null,
      };
    } catch {
      return {
        ...emptyCredentials(),
        clientId: fromEnv,
        clientSecret: "",
        authState: fromEnv ? "configured" : "error",
        lastError: "YouTube credentials could not be read.",
      };
    }
  }

  save(next: YouTubeStoredCredentials): void {
    if (!canUseSafeStorage()) {
      throw new Error("Secure storage is unavailable on this computer.");
    }
    const file = credentialPath(this.paths);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(next));
    fs.writeFileSync(file, encrypted);
  }
}
