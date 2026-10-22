import fs from "fs";
import path from "path";
import { safeStorage } from "electron";
import type { AppPaths } from "../../services/app-paths";
import type { ZoomOAuthTokens, ZoomUserProfile } from "./zoom-types";

const TOKEN_FILE = "zoom-oauth-tokens.cred";

type StoredTokenBlob = {
  tokens: ZoomOAuthTokens;
  user: ZoomUserProfile | null;
  connectedAt: string | null;
};

function canUseSafeStorage(): boolean {
  try {
    return safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    return false;
  }
}

function tokenPath(paths: AppPaths): string {
  return path.join(paths.credentialsDir, TOKEN_FILE);
}

/**
 * Machine-level Zoom user OAuth tokens (access + refresh).
 * Never returned to renderer, packages, display HTML, or logs.
 */
export class ZoomTokenStore {
  constructor(private readonly paths: AppPaths) {}

  hasTokens(): boolean {
    return this.read()?.tokens.accessToken != null;
  }

  read(): StoredTokenBlob | null {
    const file = tokenPath(this.paths);
    if (!canUseSafeStorage() || !fs.existsSync(file)) {
      return null;
    }
    try {
      const decrypted = safeStorage.decryptString(fs.readFileSync(file));
      const parsed = JSON.parse(decrypted) as Partial<StoredTokenBlob>;
      const accessToken = String(parsed.tokens?.accessToken ?? "").trim();
      const refreshToken = String(parsed.tokens?.refreshToken ?? "").trim();
      const expiresAtMs = Number(parsed.tokens?.expiresAtMs ?? 0);
      if (!accessToken || !refreshToken || !Number.isFinite(expiresAtMs)) {
        return null;
      }
      return {
        tokens: {
          accessToken,
          refreshToken,
          expiresAtMs,
          scope: parsed.tokens?.scope ?? null,
          tokenType: parsed.tokens?.tokenType ?? null,
        },
        user: parsed.user ?? null,
        connectedAt:
          typeof parsed.connectedAt === "string" ? parsed.connectedAt : null,
      };
    } catch {
      return null;
    }
  }

  save(input: {
    tokens: ZoomOAuthTokens;
    user?: ZoomUserProfile | null;
  }): void {
    if (!canUseSafeStorage()) {
      throw new Error(
        "Secure credential storage is unavailable on this system.",
      );
    }
    const existing = this.read();
    const payload: StoredTokenBlob = {
      tokens: input.tokens,
      user: input.user ?? existing?.user ?? null,
      connectedAt: existing?.connectedAt ?? new Date().toISOString(),
    };
    fs.mkdirSync(this.paths.credentialsDir, { recursive: true });
    fs.writeFileSync(
      tokenPath(this.paths),
      safeStorage.encryptString(JSON.stringify(payload)),
    );
  }

  updateUser(user: ZoomUserProfile): void {
    const current = this.read();
    if (!current) return;
    this.save({ tokens: current.tokens, user });
  }

  clear(): void {
    const file = tokenPath(this.paths);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  getPublicMeta(): {
    userConnected: boolean;
    connectedAs: string | null;
    connectedAt: string | null;
    expiresAtMs: number | null;
  } {
    const stored = this.read();
    if (!stored) {
      return {
        userConnected: false,
        connectedAs: null,
        connectedAt: null,
        expiresAtMs: null,
      };
    }
    const label =
      stored.user?.displayName?.trim() ||
      stored.user?.email?.trim() ||
      (stored.user?.id ? `Zoom user ${stored.user.id}` : "Zoom user");
    return {
      userConnected: true,
      connectedAs: label,
      connectedAt: stored.connectedAt,
      expiresAtMs: stored.tokens.expiresAtMs,
    };
  }
}
